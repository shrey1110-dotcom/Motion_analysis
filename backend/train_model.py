import os
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
import joblib

# Set random seed for reproducibility
np.random.seed(42)

def _clip(v, lo, hi):
    return float(np.clip(v, lo, hi))


def generate_synthetic_squats(n_samples=1000):
    """Generates synthetic tabular features for Squats."""
    data = []

    # Good Squats (Class 0)
    for _ in range(int(n_samples * 0.32)):
        data.append({
            "activity": "squat",
            "depth_ratio": _clip(np.random.normal(0.55, 0.06), 0.10, 0.85),
            "min_knee_angle": _clip(np.random.normal(89, 10), 45, 165),
            "trunk_angle_bottom": _clip(np.random.normal(155, 10), 90, 180),
            "knee_symmetry": _clip(np.random.normal(4.2, 2.6), 0, 45),
            "head_stability": _clip(np.random.normal(0.026, 0.012), 0.0, 0.15),
            "label": "Good Squat"
        })

    # Bad Squat - Shallow Depth (Class 1)
    for _ in range(int(n_samples * 0.32)):
        data.append({
            "activity": "squat",
            "depth_ratio": _clip(np.random.normal(0.32, 0.07), 0.05, 0.80),
            "min_knee_angle": _clip(np.random.normal(118, 13), 60, 175),
            "trunk_angle_bottom": _clip(np.random.normal(139, 13), 80, 180),
            "knee_symmetry": _clip(np.random.normal(7.0, 4.0), 0, 55),
            "head_stability": _clip(np.random.normal(0.04, 0.015), 0.0, 0.18),
            "label": "Shallow Squat"
        })

    # Bad Squat - Knee Valgus / Asymmetry (Class 2)
    for _ in range(int(n_samples * 0.32)):
        data.append({
            "activity": "squat",
            "depth_ratio": _clip(np.random.normal(0.47, 0.08), 0.05, 0.90),
            "min_knee_angle": _clip(np.random.normal(101, 13), 55, 170),
            "trunk_angle_bottom": _clip(np.random.normal(142, 15), 80, 180),
            "knee_symmetry": _clip(np.random.normal(18, 7), 0, 60),
            "head_stability": _clip(np.random.normal(0.05, 0.02), 0.0, 0.2),
            "label": "Knee Valgus / Bad Posture"
        })

    # Hard boundary / ambiguous squat cases to reduce over-separation
    remaining = n_samples - len(data)
    for _ in range(max(0, remaining)):
        hard_label = np.random.choice(
            ["Good Squat", "Shallow Squat", "Knee Valgus / Bad Posture"],
            p=[0.34, 0.33, 0.33],
        )
        data.append({
            "activity": "squat",
            "depth_ratio": _clip(np.random.normal(0.45, 0.10), 0.05, 0.9),
            "min_knee_angle": _clip(np.random.normal(101, 18), 55, 178),
            "trunk_angle_bottom": _clip(np.random.normal(144, 18), 75, 180),
            "knee_symmetry": _clip(np.random.normal(11, 7), 0, 65),
            "head_stability": _clip(np.random.normal(0.042, 0.024), 0.0, 0.22),
            "label": hard_label
        })

    return pd.DataFrame(data)


def generate_synthetic_cover_drives(n_samples=1000):
    """Generates synthetic tabular features for Cricket Cover Drives."""
    data = []

    # Good Cover Drive (Class 0)
    for _ in range(int(n_samples * 0.32)):
        data.append({
            "activity": "cover_drive",
            "head_stability": _clip(np.random.normal(0.017, 0.008), 0.0, 0.16),
            "front_knee_angle_impact": _clip(np.random.normal(133, 11), 85, 180),
            "bat_swing_compactness": _clip(np.random.normal(0.39, 0.11), 0.05, 1.2),
            "weight_transfer_delay": _clip(np.random.normal(0.055, 0.026), 0.0, 0.5),
            "follow_through_alignment": _clip(np.random.normal(160, 9), 90, 180),
            "label": "Good Cover Drive"
        })

    # Bad Cover Drive - Late Weight Transfer (Class 1)
    for _ in range(int(n_samples * 0.32)):
        data.append({
            "activity": "cover_drive",
            "head_stability": _clip(np.random.normal(0.034, 0.013), 0.0, 0.2),
            "front_knee_angle_impact": _clip(np.random.normal(154, 12), 95, 180),
            "bat_swing_compactness": _clip(np.random.normal(0.51, 0.12), 0.05, 1.3),
            "weight_transfer_delay": _clip(np.random.normal(0.20, 0.055), 0.0, 0.6),
            "follow_through_alignment": _clip(np.random.normal(144, 12), 80, 180),
            "label": "Late Weight Transfer"
        })

    # Bad Cover Drive - Swinging Across / Not compact (Class 2)
    for _ in range(int(n_samples * 0.32)):
        data.append({
            "activity": "cover_drive",
            "head_stability": _clip(np.random.normal(0.043, 0.016), 0.0, 0.22),
            "front_knee_angle_impact": _clip(np.random.normal(143, 13), 85, 180),
            "bat_swing_compactness": _clip(np.random.normal(0.29, 0.12), 0.02, 1.2),
            "weight_transfer_delay": _clip(np.random.normal(0.105, 0.045), 0.0, 0.5),
            "follow_through_alignment": _clip(np.random.normal(132, 14), 70, 180),
            "label": "Wide Swing / Poor Alignment"
        })

    # Hard boundary / ambiguous cover drive cases
    remaining = n_samples - len(data)
    for _ in range(max(0, remaining)):
        hard_label = np.random.choice(
            ["Good Cover Drive", "Late Weight Transfer", "Wide Swing / Poor Alignment"],
            p=[0.34, 0.33, 0.33],
        )
        data.append({
            "activity": "cover_drive",
            "head_stability": _clip(np.random.normal(0.038, 0.022), 0.0, 0.25),
            "front_knee_angle_impact": _clip(np.random.normal(145, 16), 80, 180),
            "bat_swing_compactness": _clip(np.random.normal(0.40, 0.17), 0.02, 1.35),
            "weight_transfer_delay": _clip(np.random.normal(0.12, 0.07), 0.0, 0.65),
            "follow_through_alignment": _clip(np.random.normal(144, 18), 70, 180),
            "label": hard_label
        })

    return pd.DataFrame(data)

def train_and_export():
    print("1. Generating Synthetic Biomechanical Data...")
    df_squats = generate_synthetic_squats(1500)
    df_drives = generate_synthetic_cover_drives(1500)
    
    # We train completely separate models for completely different activities
    print("2. Training Squat Random Forest Classifier...")
    X_squat = df_squats.drop(columns=["activity", "label"])
    y_squat = df_squats["label"]
    
    X_train_s, X_test_s, y_train_s, y_test_s = train_test_split(X_squat, y_squat, test_size=0.2, random_state=42)
    rf_squat = RandomForestClassifier(
        n_estimators=160,
        max_depth=8,
        min_samples_leaf=1,
        random_state=42
    )
    rf_squat.fit(X_train_s, y_train_s)
    
    preds_s = rf_squat.predict(X_test_s)
    acc_s = accuracy_score(y_test_s, preds_s)
    print(f"   => Squat Model Accuracy: {acc_s * 100:.2f}%")
    
    print("3. Training Cover Drive Random Forest Classifier...")
    X_drive = df_drives.drop(columns=["activity", "label"])
    y_drive = df_drives["label"]
    
    X_train_d, X_test_d, y_train_d, y_test_d = train_test_split(X_drive, y_drive, test_size=0.2, random_state=42)
    rf_drive = RandomForestClassifier(
        n_estimators=160,
        max_depth=8,
        min_samples_leaf=1,
        random_state=42
    )
    rf_drive.fit(X_train_d, y_train_d)
    
    preds_d = rf_drive.predict(X_test_d)
    acc_d = accuracy_score(y_test_d, preds_d)
    print(f"   => Cover Drive Model Accuracy: {acc_d * 100:.2f}%")
    
    print("4. Exporting Models (.pkl)...")
    os.makedirs("models", exist_ok=True)
    joblib.dump(rf_squat, "models/rf_squat.pkl")
    joblib.dump(rf_drive, "models/rf_cover_drive.pkl")
    print("   => Saved to backend/models/")
    
    # Save a sample of the dataset to show judges
    full_df = pd.concat([df_squats, df_drives], ignore_index=True)
    full_df.to_csv("models/synthetic_dataset_sample.csv", index=False)
    print("   => Saved synthetic_dataset_sample.csv for Hackathon presentation.")

if __name__ == "__main__":
    train_and_export()
