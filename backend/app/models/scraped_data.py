"""
AgentFlow AI - Scraped Data Model

SQLAlchemy ORM model for raw data collected from web sources.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    JSON,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ScrapedData(Base):
    """Raw scraped content from various data sources (Amazon, YouTube, Reddit)."""

    __tablename__ = "scraped_data"
    __table_args__ = (
        Index("ix_scraped_data_workflow_source", "workflow_id", "source"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workflows.id"), nullable=False
    )
    source: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # amazon / youtube / reddit
    content: Mapped[str] = mapped_column(
        Text, nullable=False
    )
    # 'metadata_' avoids SQLAlchemy MetaData conflict; maps to 'metadata' column
    metadata_: Mapped[dict | None] = mapped_column(
        "metadata", JSON, nullable=True
    )
    sentiment_score: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    sentiment_label: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    workflow: Mapped["Workflow"] = relationship(
        "Workflow", back_populates="scraped_data"
    )

    def __repr__(self) -> str:
        return f"<ScrapedData(id={self.id}, source={self.source})>"
