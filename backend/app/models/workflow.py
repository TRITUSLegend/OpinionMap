"""
AgentFlow AI - Workflow Model

SQLAlchemy ORM model for analysis workflow orchestration and tracking.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Workflow(Base):
    """Workflow model tracking multi-agent analysis pipeline execution."""

    __tablename__ = "workflows"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    query: Mapped[str] = mapped_column(
        Text, nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(50), default="pending"
    )  # pending / running / completed / failed
    sources: Mapped[dict | None] = mapped_column(
        JSON, nullable=True
    )
    result_summary: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    agent_states: Mapped[dict | None] = mapped_column(
        JSON, nullable=True
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )

    # Relationships
    user: Mapped["User"] = relationship(
        "User", back_populates="workflows"
    )
    reports: Mapped[list["Report"]] = relationship(
        "Report", back_populates="workflow", lazy="selectin"
    )
    scraped_data: Mapped[list["ScrapedData"]] = relationship(
        "ScrapedData", back_populates="workflow", lazy="selectin"
    )
    agent_logs: Mapped[list["AgentLog"]] = relationship(
        "AgentLog", back_populates="workflow", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Workflow(id={self.id}, status={self.status})>"
