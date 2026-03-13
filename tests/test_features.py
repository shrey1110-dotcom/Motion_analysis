from app.analysis.features import (
    cover_drive_features_from_series,
    extract_common_series,
    kinematics_stream,
    squat_features_from_series,
)


def test_extract_common_series_preserves_frame_count(sample_squat_frames) -> None:
    series = extract_common_series(sample_squat_frames)
    assert len(series["timestamps"]) == len(sample_squat_frames)
    assert len(series["hip_velocity"]) == len(sample_squat_frames)


def test_kinematics_stream_rounds_series_output(sample_squat_frames) -> None:
    series = extract_common_series(sample_squat_frames)
    stream = kinematics_stream(series)
    assert len(stream) == len(sample_squat_frames)
    assert stream[0].timestamp == 0.0


def test_squat_feature_extraction_reports_depth_ratio(sample_squat_frames) -> None:
    series = extract_common_series(sample_squat_frames)
    features = squat_features_from_series(series)
    assert features["depth_ratio"] > 0.0


def test_cover_drive_feature_extraction_reports_transfer_delay(sample_drive_frames) -> None:
    series = extract_common_series(sample_drive_frames)
    features = cover_drive_features_from_series(series, fps=10.0)
    assert features["weight_transfer_delay"] >= 0.0
