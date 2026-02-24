from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, DateTime, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AnalysisSession(Base):
    __tablename__ = "analysis_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    clerk_user_id: Mapped[str] = mapped_column(String(128), index=True)
    activity: Mapped[str] = mapped_column(String(64))
    score: Mapped[int] = mapped_column(Integer)
    ml_label: Mapped[str] = mapped_column(String(128), default="AI Heuristics")
    consistency: Mapped[float] = mapped_column(Float, default=0.0)
    risk: Mapped[str] = mapped_column(String(32), default="Medium")
    power: Mapped[int] = mapped_column(Integer, default=0)
    raw_analysis: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=datetime.utcnow
    )
