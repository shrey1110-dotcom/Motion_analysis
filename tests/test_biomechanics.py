from app.analysis.biomechanics import biomechanics_summary
from app.analysis.features import extract_common_series


def test_biomechanics_summary_returns_positive_force(sample_squat_frames) -> None:
    series = extract_common_series(sample_squat_frames)
    summary = biomechanics_summary("squat", series)
    assert summary.force_estimate_n > 0
    assert 0 <= summary.stability_score <= 100


def test_biomechanics_summary_handles_cricket_activity(sample_drive_frames) -> None:
    series = extract_common_series(sample_drive_frames)
    summary = biomechanics_summary("cricket_cover_drive", series)
    assert summary.torque_estimate_nm > 0
