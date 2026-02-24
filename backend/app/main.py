from __future__ import annotations

from pathlib import Path

from fastapi import Depends, FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from app.analysis.activity import detect_activity
from app.analysis.biomechanics import biomechanics_summary
from app.analysis.features import (
    cover_drive_features_from_series,
    extract_common_series,
    kinematics_stream,
    squat_features_from_series,
)
from app.analysis.feedback import (
    deterministic_feedback,
    joint_assessment,
    maybe_rewrite_with_llm,
    performance_explanations,
)
from app.analysis.image_squat_model import predict_squat_image
from app.analysis.video_cricket_model import predict_cricket_action_video
from app.auth import get_current_user_id
from app.db import get_db, init_db
from app.models import AnalysisSession
from app.analysis.scoring import score_activity
from app.schemas import (
    AnalysisRequest,
    AnalysisResponse,
    CricketActionPredictionResponse,
    SessionCreateRequest,
    SessionResponse,
    SquatImagePredictionResponse,
)

app = FastAPI(title="Sports Motion Analysis API", version="0.2.0")
init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIR = ROOT / "frontend"


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/analyze", response_model=AnalysisResponse)
def analyze(payload: AnalysisRequest) -> AnalysisResponse:
    frames = payload.frames
    activity = detect_activity(frames, payload.activity_hint)

    series = extract_common_series(frames)

    if activity == "squat":
        feature_values = squat_features_from_series(series)
    else:
        feature_values = cover_drive_features_from_series(series, payload.fps)

    overall, metrics, ml_label = score_activity(activity, feature_values)
    bio = biomechanics_summary(activity, series)

    feedback = deterministic_feedback(activity, metrics)
    feedback = maybe_rewrite_with_llm(activity, feedback, metrics, bio)

    explanations = performance_explanations(activity, metrics, bio)
    joints = joint_assessment(activity, metrics)
    live_stream = kinematics_stream(series)

    timeline = {k: [round(v, 4) for v in vals] for k, vals in series.items()}

    return AnalysisResponse(
        activity=activity,
        overall_score=overall,
        ml_label=ml_label,
        metrics=metrics,
        feedback=feedback,
        coaching_explanations=explanations,
        timeline=timeline,
        kinematics_stream=live_stream,
        biomechanics=bio,
        joint_assessment=joints,
    )


@app.post("/api/predict-squat-image", response_model=SquatImagePredictionResponse)
async def predict_squat_image_endpoint(file: UploadFile = File(...)) -> SquatImagePredictionResponse:
    image_bytes = await file.read()
    result = predict_squat_image(image_bytes)
    return SquatImagePredictionResponse(**result)


@app.post(
    "/api/predict-cricket-action-video", response_model=CricketActionPredictionResponse
)
async def predict_cricket_action_video_endpoint(
    file: UploadFile = File(...),
) -> CricketActionPredictionResponse:
    video_bytes = await file.read()
    result = predict_cricket_action_video(video_bytes)
    return CricketActionPredictionResponse(**result)


@app.get("/api/sessions", response_model=list[SessionResponse])
def list_sessions(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> list[SessionResponse]:
    rows = (
        db.query(AnalysisSession)
        .filter(AnalysisSession.clerk_user_id == user_id)
        .order_by(AnalysisSession.created_at.desc())
        .limit(100)
        .all()
    )
    return [SessionResponse.model_validate(r) for r in rows]


@app.post("/api/sessions", response_model=SessionResponse)
def create_session(
    payload: SessionCreateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> SessionResponse:
    row = AnalysisSession(
        clerk_user_id=user_id,
        activity=payload.activity,
        score=payload.score,
        ml_label=payload.ml_label,
        consistency=payload.consistency,
        risk=payload.risk,
        power=payload.power,
        raw_analysis=payload.raw_analysis,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return SessionResponse.model_validate(row)


if FRONTEND_DIR.exists() and (FRONTEND_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="assets")


@app.get("/")
def serve_index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")
