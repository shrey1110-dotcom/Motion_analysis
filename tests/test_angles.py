from app.analysis.angles import angle_abc, joint_angle, midpoint


def test_angle_abc_returns_ninety_degrees() -> None:
    angle = angle_abc((1.0, 0.0), (0.0, 0.0), (0.0, 1.0))
    assert round(angle, 2) == 90.0


def test_midpoint_averages_hip_coordinates(sample_squat_frames) -> None:
    x, y = midpoint(sample_squat_frames[0], "left_hip", "right_hip")
    assert x == 0.5
    assert y == 0.42


def test_joint_angle_uses_named_keypoints(sample_squat_frames) -> None:
    knee_angle = joint_angle(sample_squat_frames[0], "left_hip", "left_knee", "left_ankle")
    assert knee_angle == 180.0
