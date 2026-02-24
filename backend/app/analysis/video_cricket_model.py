from __future__ import annotations

from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Optional

import cv2
import joblib
import numpy as np


MODEL_PATH = Path(__file__).resolve().parents[2] / "models" / "rf_cricket_action_real.pkl"
_MODEL = None


def _load_model():
    global _MODEL
    if _MODEL is None and MODEL_PATH.exists():
        _MODEL = joblib.load(MODEL_PATH)
    return _MODEL


def _image_features(gray_128: np.ndarray) -> np.ndarray:
    arr = gray_128.astype(np.float32) / 255.0

    mean = float(arr.mean())
    std = float(arr.std())
    p10 = float(np.percentile(arr, 10))
    p25 = float(np.percentile(arr, 25))
    p50 = float(np.percentile(arr, 50))
    p75 = float(np.percentile(arr, 75))
    p90 = float(np.percentile(arr, 90))

    gy, gx = np.gradient(arr)
    grad_mag = np.sqrt(gx ** 2 + gy ** 2)
    gmean = float(grad_mag.mean())
    gstd = float(grad_mag.std())

    pooled = arr.reshape(4, 32, 4, 32).mean(axis=(1, 3)).flatten()
    feats = [mean, std, p10, p25, p50, p75, p90, gmean, gstd] + pooled.tolist()
    return np.array(feats, dtype=np.float32)


def _extract_video_features(video_path: Path) -> Optional[np.ndarray]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total <= 0:
        cap.release()
        return None

    picks = sorted(set([0, total // 3, (2 * total) // 3, max(0, total - 1)]))
    frame_feats: list[np.ndarray] = []

    for idx in picks:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
        ok, frame = cap.read()
        if not ok or frame is None:
            continue
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.resize(gray, (128, 128), interpolation=cv2.INTER_AREA)
        frame_feats.append(_image_features(gray))

    cap.release()

    if not frame_feats:
        return None

    stacked = np.vstack(frame_feats)
    return np.concatenate([stacked.mean(axis=0), stacked.std(axis=0)], axis=0).astype(
        np.float32
    )


def predict_cricket_action_video(video_bytes: bytes) -> dict[str, object]:
    model = _load_model()
    if model is None:
        raise FileNotFoundError(f"Real cricket model not found at {MODEL_PATH}")

    with NamedTemporaryFile(delete=True, suffix=".mp4") as tmp:
        tmp.write(video_bytes)
        tmp.flush()
        features = _extract_video_features(Path(tmp.name))

    if features is None:
        raise ValueError("Could not read video frames for inference.")

    features = features.reshape(1, -1)
    label = str(model.predict(features)[0])
    probs = model.predict_proba(features)[0]
    classes = [str(c) for c in model.classes_]
    class_scores = {c: round(float(p), 4) for c, p in zip(classes, probs)}
    confidence = round(max(class_scores.values()), 4) if class_scores else 0.0

    return {
        "label": label,
        "confidence": confidence,
        "class_scores": class_scores,
    }
