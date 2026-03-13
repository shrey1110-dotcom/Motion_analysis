from __future__ import annotations

import sys
from pathlib import Path

import pytest


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.schemas import FramePose, Keypoint  # noqa: E402


def _blank_keypoints() -> list[Keypoint]:
    return [Keypoint(x=0.0, y=0.0, score=1.0) for _ in range(17)]


def make_frame(
    *,
    timestamp: float,
    left_hip: tuple[float, float] = (0.4, 0.5),
    right_hip: tuple[float, float] = (0.6, 0.5),
    left_knee: tuple[float, float] = (0.4, 0.7),
    right_knee: tuple[float, float] = (0.6, 0.7),
    left_ankle: tuple[float, float] = (0.4, 0.9),
    right_ankle: tuple[float, float] = (0.6, 0.9),
    left_shoulder: tuple[float, float] = (0.4, 0.25),
    right_shoulder: tuple[float, float] = (0.6, 0.25),
    left_wrist: tuple[float, float] = (0.35, 0.35),
    right_wrist: tuple[float, float] = (0.65, 0.35),
    nose: tuple[float, float] = (0.5, 0.15),
) -> FramePose:
    points = _blank_keypoints()
    mapping = {
        0: nose,
        5: left_shoulder,
        6: right_shoulder,
        9: left_wrist,
        10: right_wrist,
        11: left_hip,
        12: right_hip,
        13: left_knee,
        14: right_knee,
        15: left_ankle,
        16: right_ankle,
    }
    for idx, (x, y) in mapping.items():
        points[idx] = Keypoint(x=x, y=y, score=1.0)
    return FramePose(timestamp=timestamp, keypoints=points)


@pytest.fixture
def sample_squat_frames() -> list[FramePose]:
    return [
        make_frame(timestamp=0.0, left_hip=(0.4, 0.42), right_hip=(0.6, 0.42)),
        make_frame(timestamp=0.1, left_hip=(0.4, 0.48), right_hip=(0.6, 0.48)),
        make_frame(timestamp=0.2, left_hip=(0.4, 0.58), right_hip=(0.6, 0.58)),
        make_frame(timestamp=0.3, left_hip=(0.4, 0.5), right_hip=(0.6, 0.5)),
    ]


@pytest.fixture
def sample_drive_frames() -> list[FramePose]:
    return [
        make_frame(timestamp=0.0, left_wrist=(0.34, 0.34), right_wrist=(0.54, 0.34)),
        make_frame(timestamp=0.1, left_wrist=(0.44, 0.34), right_wrist=(0.68, 0.34)),
        make_frame(timestamp=0.2, left_wrist=(0.54, 0.34), right_wrist=(0.82, 0.34)),
        make_frame(timestamp=0.3, left_wrist=(0.52, 0.34), right_wrist=(0.76, 0.34)),
    ]
