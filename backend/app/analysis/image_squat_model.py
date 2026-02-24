from __future__ import annotations

from io import BytesIO
from pathlib import Path

import joblib
import numpy as np
from PIL import Image


MODEL_PATH = Path(__file__).resolve().parents[2] / "models" / "rf_squat_real.pkl"
_MODEL = None


def _load_model():
    global _MODEL
    if _MODEL is None and MODEL_PATH.exists():
        _MODEL = joblib.load(MODEL_PATH)
    return _MODEL


def extract_image_features_from_bytes(image_bytes: bytes) -> np.ndarray:
    img = Image.open(BytesIO(image_bytes)).convert("L").resize((128, 128))
    arr = np.asarray(img, dtype=np.float32) / 255.0

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


def predict_squat_image(image_bytes: bytes) -> dict[str, object]:
    model = _load_model()
    if model is None:
        raise FileNotFoundError(f"Real squat model not found at {MODEL_PATH}")

    features = extract_image_features_from_bytes(image_bytes).reshape(1, -1)
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

