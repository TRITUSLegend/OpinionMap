"""
OpinionMap - Database configuration

Async SQLAlchemy engine, session factory, declarative base, and dependency injection.
"""

from collections.abc import AsyncGenerator

from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Declarative base class for all SQLAlchemy models."""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that provides a database session per request.

    Commits on success, rolls back on exception, and always closes the session.
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


def _create_missing_indexes(conn) -> None:
    """Create declared indexes that are missing from already-existing tables.

    ``create_all`` runs with ``checkfirst=True`` and skips any table that already
    exists, so an index added to a model after that table was first created is
    never applied. This walks the declared indexes and creates the missing ones.
    Idempotent and safe to run on every startup.
    """
    inspector = inspect(conn)
    existing_tables = set(inspector.get_table_names())

    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue  # create_all just made it, indexes included
        existing_indexes = {ix["name"] for ix in inspector.get_indexes(table.name)}
        for index in table.indexes:
            if index.name not in existing_indexes:
                index.create(bind=conn)


async def init_db() -> None:
    """Create all database tables from the ORM metadata.

    Should be called once at application startup.
    """
    # Importing the models package registers every table on Base.metadata.
    # Without this, init_db() would only see models that happened to be imported
    # already, and would silently skip the rest.
    import app.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_create_missing_indexes)
