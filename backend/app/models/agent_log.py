"""
AgentFlow AI - Agent Log Model

SQLAlchemy ORM model for tracking AI agent execution history.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AgentLog(Base):
    """Execution log entry for an individual AI agent within a workflow."""

    __tablename__ = "agent_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workflows.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    agent_name: Mapped[str] = mapped_column(
        String(100), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # started / completed / failed
    input_data: Mapped[dict | None] = mapped_column(
        JSON, nullable=True
    )
    output_data: Mapped[dict | None] = mapped_column(
        JSON, nullable=True
    )
    error_message: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    tokens_used: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    execution_time_ms: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    workflow: Mapped["Workflow"] = relationship(
        "Workflow", back_populates="agent_logs"
    )
    user: Mapped["User"] = relationship(
        "User", back_populates="agent_logs"
    )

    def __repr__(self) -> str:
        return f"<AgentLog(id={self.id}, agent={self.agent_name}, status={self.status})>"
