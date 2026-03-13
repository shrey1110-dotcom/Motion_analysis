from app.analysis.activity import detect_activity


def test_detect_activity_respects_explicit_hint(sample_squat_frames) -> None:
    assert detect_activity(sample_squat_frames, "squat") == "squat"


def test_detect_activity_identifies_squat_from_hip_motion(sample_squat_frames) -> None:
    assert detect_activity(sample_squat_frames, "auto") == "squat"


def test_detect_activity_identifies_cover_drive_from_wrist_motion(sample_drive_frames) -> None:
    assert detect_activity(sample_drive_frames, "auto") == "cricket_cover_drive"
