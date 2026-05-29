"""
AgentFlow AI - User Model

SQLAlchemy ORM model for user accounts with role-based access control.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    """User account model with authentication and RBAC support."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    hashed_password: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    full_name: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    role: Mapped[str] = mapped_column(
        String(50), default="viewer"
    )  # admin, analyst, viewer
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )

    # Relationships
    reports: Mapped[list["Report"]] = relationship(
        "Report", back_populates="user", lazy="selectin"
    )
    workflows: Mapped[list["Workflow"]] = relationship(
        "Workflow", back_populates="user", lazy="selectin"
    )
    agent_logs: Mapped[list["AgentLog"]] = relationship(
        "AgentLog", back_populates="user", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email={self.email}, role={self.role})>"
