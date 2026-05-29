"""
AgentFlow AI - Analytics Model

SQLAlchemy ORM model for computed analytics metrics.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Analytics(Base):
    """Computed analytics metrics for workflow analysis results."""

    __tablename__ = "analytics"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workflows.id"), nullable=False
    )
    metric_type: Mapped[str] = mapped_column(
        String(100), nullable=False
    )  # sentiment_distribution, keyword_frequency, trend_data, competitor_score
    metric_data: Mapped[dict] = mapped_column(
        JSON, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<Analytics(id={self.id}, type={self.metric_type})>"
