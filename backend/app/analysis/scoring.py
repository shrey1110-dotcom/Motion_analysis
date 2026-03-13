from __future__ import annotations

import logging
from pathlib import Path

import joblib
import pandas as pd

from app.analysis.reference_library import REFERENCE_LIBRARY
from app.schemas import MetricResult


MODEL_DIR = Path(__file__).resolve().parents[2] / "models"
LOGGER = logging.getLogger(__name__)


def _model_path(name: str) -> Path:
    return MODEL_DIR / name


def _load_joblib_model(name: str):
    try:
        return joblib.load(_model_path(name))
    except Exception:
        return None


# Prefer real-data model when it is compatible with keypoint feature schema.
rf_squat_real = _load_joblib_model("rf_squat_real.pkl")
rf_squat = _load_joblib_model("rf_squat.pkl")
rf_drive = _load_joblib_model("rf_cover_drive.pkl")

if rf_squat is None:
    LOGGER.warning("Random forest squat model is unavailable; using heuristic fallback.")
if rf_drive is None:
    LOGGER.warning("Random forest cover drive model is unavailable; using heuristic fallback.")


def _metric_score(value: float, lo: float, hi: float) -> tuple[float, float]:
    """Fallback heuristic scoring for individual metrics to keep the UI charts working."""
    if lo <= value <= hi:
        return 0.0, 100.0
    deviation = min(abs(value - lo), abs(value - hi))
    width = max(hi - lo, 1e-6)
    penalty = (deviation / width) * 100.0
    return deviation, max(0.0, 100.0 - penalty)


def _heuristic_overall_score(metrics: list[MetricResult], weights: dict[str, float]) -> float:
    weighted_sum = sum(m.score * weights[m.name] for m in metrics)
    total_weight = sum(weights[m.name] for m in metrics)
    return weighted_sum / max(total_weight, 1e-6)


def score_activity(activity: str, feature_values: dict[str, float]) -> tuple[float, list[MetricResult], str]:
    """
    Scores the activity using the Custom Random Forest classifiers.
    Returns: (overall_score, metrics_list, ml_classification_label)
    """
    ref = REFERENCE_LIBRARY[activity]
    targets = ref["targets"]
    weights = ref["weights"]
    
    # We still calculate individual metric scores so the frontend UI charts have data
    metrics: list[MetricResult] = []
    
    for name, value in feature_values.items():
        lo, hi = targets[name]
        deviation, score = _metric_score(value, lo, hi)
        weight = weights[name]
        metrics.append(
            MetricResult(
                name=name,
                value=round(value, 4),
                target_min=lo,
                target_max=hi,
                deviation=round(deviation, 4),
                score=round(score, 2),
            )
        )
        
    # ML INFERENCE
    ml_label = "Unknown"
    overall_score = 50.0 # Default
    
    if activity == "squat":
        # Create DataFrame from features (must match training feature names and order)
        # Training features: depth_ratio, min_knee_angle, trunk_angle_bottom, knee_symmetry, head_stability
        df_features = pd.DataFrame([feature_values])
        
        # Ensure we only pass the columns the model expects, in case feature_values has extras
        expected_cols = ["depth_ratio", "min_knee_angle", "trunk_angle_bottom", "knee_symmetry", "head_stability"]
        df_features = df_features[[c for c in expected_cols if c in df_features.columns]]

        squat_model = rf_squat
        # rf_squat_real is trained on image-derived features; only use it here if compatible.
        if rf_squat_real is not None and getattr(rf_squat_real, "n_features_in_", None) == len(df_features.columns):
            squat_model = rf_squat_real

        if squat_model is None:
            overall_score = _heuristic_overall_score(metrics, weights)
            ml_label = "Heuristic Grading (No Model)"
            return round(overall_score, 2), metrics, ml_label

        # Predict Probabilities to generate a 0-100 score
        probs = squat_model.predict_proba(df_features)[0]
        classes = squat_model.classes_
        
        # Predict Class label
        ml_label = squat_model.predict(df_features)[0]
        
        # If "Good Squat" is in classes, we base the score on its probability
        if "Good Squat" in classes:
            idx = list(classes).index("Good Squat")
            overall_score = probs[idx] * 100.0
            
            # small bump so "Good" is never a 50
            if ml_label == "Good Squat" and overall_score < 80:
                 overall_score = 80 + (overall_score / 100.0) * 20
        elif "good" in classes:
            idx = list(classes).index("good")
            overall_score = probs[idx] * 100.0
            if ml_label == "good" and overall_score < 80:
                overall_score = 80 + (overall_score / 100.0) * 20
        else:
            overall_score = 40.0 # fallback

            
    elif activity == "cricket_cover_drive" and rf_drive is not None:
        df_features = pd.DataFrame([feature_values])
        expected_cols = ["head_stability", "front_knee_angle_impact", "bat_swing_compactness", "weight_transfer_delay", "follow_through_alignment"]
        df_features = df_features[[c for c in expected_cols if c in df_features.columns]]
        
        probs = rf_drive.predict_proba(df_features)[0]
        classes = rf_drive.classes_
        ml_label = rf_drive.predict(df_features)[0]
        
        if "Good Cover Drive" in classes:
            idx = list(classes).index("Good Cover Drive")
            overall_score = probs[idx] * 100.0
            
            if ml_label == "Good Cover Drive" and overall_score < 80:
                 overall_score = 80 + (overall_score / 100.0) * 20
        else:
            overall_score = 40.0
    else:
        # Fallback to heuristic if models missing
        overall_score = _heuristic_overall_score(metrics, weights)
        ml_label = "Heuristic Grading (No Model)"

    return round(overall_score, 2), metrics, ml_label
