import argparse
from pathlib import Path
import numpy as np
from PIL import Image
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix
import joblib

# Basic image-distribution features; dependency-light (PIL + NumPy only).
def extract_image_features(img_path: Path):
    try:
        img = Image.open(img_path).convert("L").resize((128, 128))
    except Exception:
        return None

    arr = np.asarray(img, dtype=np.float32) / 255.0
    # Intensity moments
    mean = float(arr.mean())
    std = float(arr.std())
    p10 = float(np.percentile(arr, 10))
    p25 = float(np.percentile(arr, 25))
    p50 = float(np.percentile(arr, 50))
    p75 = float(np.percentile(arr, 75))
    p90 = float(np.percentile(arr, 90))

    # Gradients
    gy, gx = np.gradient(arr)
    grad_mag = np.sqrt(gx ** 2 + gy ** 2)
    gmean = float(grad_mag.mean())
    gstd = float(grad_mag.std())

    # Coarse spatial layout: 4x4 pooled grid
    pooled = arr.reshape(4, 32, 4, 32).mean(axis=(1, 3)).flatten()

    feats = [mean, std, p10, p25, p50, p75, p90, gmean, gstd] + pooled.tolist()
    return np.array(feats, dtype=np.float32)


def infer_label_from_path(path: Path):
    p = path.as_posix().lower()
    # Common class name variants for squat posture datasets
    if "good" in p or "correct" in p:
        return "good"
    if "bad_back" in p or "back" in p:
        return "bad_back"
    if "bad_heel" in p or "heel" in p:
        return "bad_heel"
    if "bad" in p:
        return "bad"
    return None


def load_dataset(root: Path):
    X, y = [], []
    exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    for p in root.rglob("*"):
        if p.suffix.lower() not in exts:
            continue
        lbl = infer_label_from_path(p)
        if lbl is None:
            continue
        f = extract_image_features(p)
        if f is None:
            continue
        X.append(f)
        y.append(lbl)
    return np.array(X), np.array(y)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", required=True)
    parser.add_argument("--out-model", default="backend/models/rf_squat_real.pkl")
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    root = Path(args.data_root)
    X, y = load_dataset(root)
    if len(X) < 50:
        raise SystemExit(f"Not enough usable images found: {len(X)}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test_size, random_state=args.seed, stratify=y
    )

    model = RandomForestClassifier(
        n_estimators=250,
        max_depth=12,
        min_samples_leaf=2,
        random_state=args.seed,
    )
    model.fit(X_train, y_train)

    pred = model.predict(X_test)
    acc = accuracy_score(y_test, pred)
    print(f"Real squat model accuracy: {acc * 100:.2f}%")
    print("Class report:\n", classification_report(y_test, pred))
    print("Confusion matrix:\n", confusion_matrix(y_test, pred))

    out = Path(args.out_model)
    out.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, out)
    print(f"Saved real-data model -> {out}")


if __name__ == "__main__":
    main()
