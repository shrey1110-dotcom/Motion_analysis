from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class Keypoint(BaseModel):
    x: float
    y: float
    score: float = 1.0


class FramePose(BaseModel):
    timestamp: float = Field(..., description="Seconds from start")
    keypoints: list[Keypoint] = Field(..., min_length=17, max_length=17)


class AnalysisRequest(BaseModel):
    activity_hint: Literal["auto", "squat", "cricket_cover_drive"] = "auto"
    fps: float = 30.0
    frames: list[FramePose] = Field(..., min_length=10)


class MetricResult(BaseModel):
    name: str
    value: float
    target_min: float
    target_max: float
    deviation: float
    score: float


class LiveDataPoint(BaseModel):
    timestamp: float
    knee_angle: float
    trunk_angle: float
    hip_y: float
    hip_velocity: float
    hip_acceleration: float


class BiomechanicsSummary(BaseModel):
    force_estimate_n: float
    torque_estimate_nm: float
    momentum_estimate: float
    power_estimate_w: float
    balance_index: float
    stability_score: float


class AnalysisResponse(BaseModel):
    activity: str
    overall_score: float
    ml_label: str = "Unknown"
    metrics: list[MetricResult]
    feedback: list[str]
    coaching_explanations: list[str]
    timeline: dict[str, list[float]]
    kinematics_stream: list[LiveDataPoint]
    biomechanics: BiomechanicsSummary
    joint_assessment: dict[str, str]


class SquatImagePredictionResponse(BaseModel):
    label: str
    confidence: float
    class_scores: dict[str, float]


class CricketActionPredictionResponse(BaseModel):
    label: str
    confidence: float
    class_scores: dict[str, float]


class SessionCreateRequest(BaseModel):
    activity: str
    score: int
    ml_label: str = "AI Heuristics"
    consistency: float = 0.0
    risk: str = "Medium"
    power: int = 0
    raw_analysis: Optional[dict] = None


class SessionResponse(BaseModel):
    id: int
    clerk_user_id: str
    activity: str
    score: int
    ml_label: str
    consistency: float
    risk: str
    power: int
    created_at: datetime

    model_config = {"from_attributes": True}
