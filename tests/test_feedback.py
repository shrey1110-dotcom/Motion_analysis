from app.analysis.feedback import (
    deterministic_feedback,
    joint_assessment,
    performance_explanations,
)
from app.schemas import BiomechanicsSummary, MetricResult


def _metric(name: str, value: float, score: float) -> MetricResult:
    return MetricResult(
        name=name,
        value=value,
        target_min=0.0,
        target_max=1.0,
        deviation=0.1,
        score=score,
    )


def _bio() -> BiomechanicsSummary:
    return BiomechanicsSummary(
        force_estimate_n=500.0,
        torque_estimate_nm=220.0,
        momentum_estimate=42.0,
        power_estimate_w=800.0,
        balance_index=0.01,
        stability_score=92.0,
    )


def test_deterministic_feedback_returns_findings_for_low_scores() -> None:
    findings = deterministic_feedback("squat", [_metric("min_knee_angle", 60.0, 70.0)])
    assert findings


def test_joint_assessment_marks_failed_squat_metrics_incorrect() -> None:
    status = joint_assessment("squat", [_metric("trunk_angle_bottom", 130.0, 60.0)])
    assert status["trunk"] == "incorrect"


def test_performance_explanations_fall_back_when_metrics_are_good() -> None:
    messages = performance_explanations("squat", [_metric("min_knee_angle", 90.0, 90.0)], _bio())
    assert messages
