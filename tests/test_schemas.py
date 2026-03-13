import pytest
from pydantic import ValidationError

from app.schemas import AnalysisRequest, FramePose, Keypoint


def _frame(timestamp: float) -> FramePose:
    return FramePose(timestamp=timestamp, keypoints=[Keypoint(x=0.0, y=0.0, score=1.0) for _ in range(17)])


def test_analysis_request_accepts_minimum_frame_count() -> None:
    req = AnalysisRequest(frames=[_frame(i / 10) for i in range(10)])
    assert req.activity_hint == "auto"


def test_analysis_request_rejects_short_sequences() -> None:
    with pytest.raises(ValidationError):
        AnalysisRequest(frames=[_frame(i / 10) for i in range(9)])
