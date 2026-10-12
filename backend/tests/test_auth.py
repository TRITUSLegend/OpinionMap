import bcrypt
import pytest
from sqlalchemy import select, update

from app.core import security
from app.database import async_session_factory
from app.models.user import User
from tests.conftest import PASSWORD, bearer, login, register

GENERIC_401 = {"detail": "Invalid email or password"}


def _db(client, operation):
    async def run():
        async with async_session_factory() as session:
            result = await operation(session)
            await session.commit()
            return result

    return client.portal.call(run)


def _set_user(client, email, **values):
    _db(client, lambda s: s.execute(update(User).where(User.email == email).values(**values)))


def _stored_hash(client, email):
    return _db(client, lambda s: s.scalar(select(User.hashed_password).where(User.email == email)))


def test_unknown_email_is_rejected(client, admin_token):
    r = login(client, "nobody@example.com")
    assert r.status_code == 401
    assert r.json() == GENERIC_401


def test_wrong_password_is_rejected(client, admin_token):
    r = login(client, "admin@example.com", password="Wrong-Horse-9")
    assert r.status_code == 401
    assert r.json() == GENERIC_401


@pytest.mark.parametrize("path", ["/api/auth/login", "/api/auth/admin-login"])
def test_every_failure_mode_gets_the_same_response(client, viewer_token, path):
    _set_user(client, "viewer@example.com", is_active=False)
    responses = [
        login(client, "nobody@example.com", path=path),
        login(client, "admin@example.com", password="Wrong-Horse-9", path=path),
        login(client, "viewer@example.com", path=path),  # inactive, correct password
        login(client, "admin@example.com", password="x" * 73, path=path),  # over bcrypt's limit
    ]
    assert {r.status_code for r in responses} == {401}
    assert {r.text for r in responses} == {'{"detail":"Invalid email or password"}'}
    assert {r.headers.get("www-authenticate") for r in responses} == {"Bearer"}


def test_unknown_email_still_costs_a_bcrypt_check(client, admin_token, monkeypatch):
    checked = []
    real_verify = security.verify_password
    monkeypatch.setattr(
        security, "verify_password", lambda p, h: checked.append(h) or real_verify(p, h)
    )
    login(client, "nobody@example.com")
    login(client, "admin@example.com", password="Wrong-Horse-9")
    assert len(checked) == 2


def test_valid_login_returns_a_working_token(client, admin_token):
    r = login(client, "admin@example.com")
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == "admin@example.com"

    me = client.get("/api/auth/me", headers=bearer(body["access_token"]))
    assert me.status_code == 200
    assert me.json()["email"] == "admin@example.com"


def test_me_requires_a_valid_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers=bearer("not-a-jwt")).status_code == 401


def test_admin_login_requires_the_admin_role(client, viewer_token):
    assert login(client, "viewer@example.com", path="/api/auth/admin-login").status_code == 403
    assert login(client, "admin@example.com", path="/api/auth/admin-login").status_code == 200


@pytest.mark.parametrize("path", ["/api/auth/users", "/api/admin/users"])
def test_user_list_is_admin_only(client, admin_token, viewer_token, path):
    assert client.get(path).status_code == 401
    assert client.get(path, headers=bearer(viewer_token)).status_code == 403
    assert client.get(path, headers=bearer(admin_token)).status_code == 200


def test_listing_users_leaves_stored_emails_untouched(client, admin_token, viewer_token):
    # Regression: a non-admin listing users used to write other accounts' masked
    # emails ("o***@...") back to the database, locking those owners out.
    register(client, "other@example.com")
    client.get("/api/auth/users", headers=bearer(viewer_token))
    r = client.get("/api/auth/users", headers=bearer(admin_token))
    assert sorted(u["email"] for u in r.json()) == [
        "admin@example.com",
        "other@example.com",
        "viewer@example.com",
    ]
    assert login(client, "other@example.com").status_code == 200


def test_no_password_hash_in_any_response(client, admin_token):
    responses = [
        register(client, "new@example.com"),
        login(client, "new@example.com"),
        client.get("/api/auth/me", headers=bearer(admin_token)),
        client.get("/api/auth/users", headers=bearer(admin_token)),
    ]
    for r in responses:
        assert r.status_code == 200
        assert "hashed_password" not in r.text
        assert "$2b$" not in r.text


def test_register_cannot_self_assign_admin(client, admin_token):
    r = register(client, "climber@example.com", role="admin")
    assert r.status_code == 200
    assert r.json()["role"] == "viewer"


def test_register_rejects_a_duplicate_email(client, admin_token):
    r = register(client, "admin@example.com")
    assert r.status_code == 400
    assert r.json() == {"detail": "Email already registered"}


@pytest.mark.parametrize(
    "override, field",
    [
        ({"email": "not-an-email"}, "email"),
        ({"password": "Short1"}, "password"),
        ({"password": "a" * 73}, "password"),
        ({"full_name": "   "}, "full_name"),
    ],
)
def test_register_validates_input(client, override, field):
    payload = {"email": "ok@example.com", "password": PASSWORD, "full_name": "Ok", **override}
    r = client.post("/api/auth/register", json=payload)
    assert r.status_code == 422
    assert field in {error["loc"][-1] for error in r.json()["detail"]}


def test_hash_from_another_cost_is_upgraded_on_login(client, admin_token):
    _set_user(
        client,
        "admin@example.com",
        hashed_password=bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt(11)).decode(),
    )
    assert login(client, "admin@example.com").status_code == 200

    upgraded = _stored_hash(client, "admin@example.com")
    assert upgraded.startswith("$2b$10$")
    assert login(client, "admin@example.com").status_code == 200
