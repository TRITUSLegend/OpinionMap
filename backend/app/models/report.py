"""
AgentFlow AI - Report Model

SQLAlchemy ORM model for generated market intelligence reports.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Report(Base):
    """Generated intelligence report with structured analysis sections."""

    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workflows.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(
        String(500), nullable=False
    )
    executive_summary: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    sentiment_analysis: Mapped[dict | None] = mapped_column(
        JSON, nullable=True
    )
    key_findings: Mapped[dict | None] = mapped_column(
        JSON, nullable=True
    )
    competitor_analysis: Mapped[dict | None] = mapped_column(
        JSON, nullable=True
    )
    recommendations: Mapped[dict | None] = mapped_column(
        JSON, nullable=True
    )
    pain_points: Mapped[dict | None] = mapped_column(
        JSON, nullable=True
    )
    full_report: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(50), default="draft"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )

    # Relationships
    workflow: Mapped["Workflow"] = relationship(
        "Workflow", back_populates="reports"
    )
    user: Mapped["User"] = relationship(
        "User", back_populates="reports"
    )

    def __repr__(self) -> str:
        return f"<Report(id={self.id}, title={self.title})>"
