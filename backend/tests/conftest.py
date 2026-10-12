"""Test fixtures for the auth endpoints.

Settings are read when app.config is first imported, so the environment is
pinned here, before any app module loads. Tests run against a throwaway SQLite
file and a small app that mounts only the auth and admin routers under their
real prefixes; importing app.main would also load the agent pipeline, which
takes far longer than the tests themselves.
"""

import os
import tempfile
from pathlib import Path

_DB_FILE = Path(tempfile.mkdtemp(prefix="opinionmap-tests-")) / "test.db"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_DB_FILE.as_posix()}"
os.environ["JWT_SECRET_KEY"] = "test-only-secret"
os.environ["BCRYPT_ROUNDS"] = "10"  # the lowest allowed value keeps the suite fast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.database import Base, engine, init_db

PASSWORD = "Correct-Horse-9"


async def _reset_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await init_db()


@pytest.fixture()
def client():
    app = FastAPI()
    app.include_router(auth_router, prefix="/api/auth")
    app.include_router(admin_router, prefix="/api/admin")
    with TestClient(app) as test_client:
        test_client.portal.call(_reset_db)
        yield test_client
        # Pooled connections belong to this client's event loop; drop them.
        test_client.portal.call(engine.dispose)


def register(client, email, password=PASSWORD, full_name="Test User", **extra):
    payload = {"email": email, "password": password, "full_name": full_name, **extra}
    return client.post("/api/auth/register", json=payload)


def login(client, email, password=PASSWORD, path="/api/auth/login"):
    return client.post(path, data={"username": email, "password": password})


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def admin_token(client):
    # The first account registered becomes the admin.
    assert register(client, "admin@example.com").json()["role"] == "admin"
    return login(client, "admin@example.com").json()["access_token"]


@pytest.fixture()
def viewer_token(client, admin_token):
    assert register(client, "viewer@example.com").json()["role"] == "viewer"
    return login(client, "viewer@example.com").json()["access_token"]
