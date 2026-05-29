"""
AgentFlow AI - Embedding Metadata Model

SQLAlchemy ORM model tracking vector embeddings stored in ChromaDB.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EmbeddingMetadata(Base):
    """Tracks metadata for text chunks embedded and stored in the vector database."""

    __tablename__ = "embeddings_metadata"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workflows.id"), nullable=False
    )
    source_id: Mapped[uuid.UUID] = mapped_column(
        nullable=False
    )  # Reference to scraped_data.id
    collection_name: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    embedding_model: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    chunk_text: Mapped[str] = mapped_column(
        Text, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<EmbeddingMetadata(id={self.id}, collection={self.collection_name})>"
