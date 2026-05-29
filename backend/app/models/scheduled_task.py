"""
AgentFlow AI - Scheduled Task Model

SQLAlchemy ORM model for recurring analysis task scheduling.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ScheduledTask(Base):
    """Scheduled recurring analysis task with cron-based execution."""

    __tablename__ = "scheduled_tasks"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    query: Mapped[str] = mapped_column(
        Text, nullable=False
    )
    schedule_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # daily / weekly / monthly
    cron_expression: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    sources: Mapped[dict | None] = mapped_column(
        JSON, nullable=True
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True
    )
    last_run_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    next_run_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )

    # Relationships
    user: Mapped["User"] = relationship("User", lazy="selectin")

    def __repr__(self) -> str:
        return f"<ScheduledTask(id={self.id}, name={self.name})>"
