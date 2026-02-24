import argparse
from pathlib import Path
from typing import Optional

import cv2
import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix


VIDEO_EXTS = {".avi", ".mp4", ".mov", ".mkv", ".webm"}


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


def _load_split(root: Path, split_name: str) -> tuple[np.ndarray, np.ndarray]:
    split_root = root / split_name
    if not split_root.exists():
        raise FileNotFoundError(f"Split not found: {split_root}")

    X, y = [], []
    class_dirs = sorted([d for d in split_root.iterdir() if d.is_dir()])
    for class_dir in class_dirs:
        label = class_dir.name
        for p in sorted(class_dir.rglob("*")):
            if p.suffix.lower() not in VIDEO_EXTS:
                continue
            f = _extract_video_features(p)
            if f is None:
                continue
            X.append(f)
            y.append(label)

    return np.array(X), np.array(y)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data-root",
        default="data/real_cricket_actions/cricketshot",
        help="Folder with train/val/test class subfolders",
    )
    parser.add_argument(
        "--out-model", default="backend/models/rf_cricket_action_real.pkl"
    )
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    root = Path(args.data_root)
    X_train_a, y_train_a = _load_split(root, "train")
    X_train_b, y_train_b = _load_split(root, "val")
    X_test, y_test = _load_split(root, "test")

    if len(X_train_a) == 0 or len(X_test) == 0:
        raise SystemExit("No usable video samples found for training/testing.")

    X_train = np.vstack([X_train_a, X_train_b])
    y_train = np.concatenate([y_train_a, y_train_b])

    model = RandomForestClassifier(
        n_estimators=360,
        max_depth=20,
        min_samples_leaf=1,
        random_state=args.seed,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)

    pred = model.predict(X_test)
    acc = accuracy_score(y_test, pred)
    print(f"Real cricket action model accuracy (test split): {acc * 100:.2f}%")
    print("Class report:\n", classification_report(y_test, pred))
    print("Confusion matrix:\n", confusion_matrix(y_test, pred))

    out = Path(args.out_model)
    out.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, out)
    print(f"Saved real-data model -> {out}")


if __name__ == "__main__":
    main()
