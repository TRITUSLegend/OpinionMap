"""Auth API routes: registration, login, and user lookup."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from fastapi.security import OAuth2PasswordRequestForm

from app.database import get_db
from app.models.user import User
from app.core.security import (
    create_access_token,
    get_current_user,
    hash_password_async,
    password_needs_rehash,
    require_role,
    verify_password_async,
)
from app.schemas.user import UserCreate, TokenResponse, UserResponse

router = APIRouter()


def _invalid_credentials() -> HTTPException:
    # Unknown email, wrong password and inactive account all get this exact
    # response, so a caller cannot tell which check failed.
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def _authenticate(db: AsyncSession, email: str, password: str) -> User:
    """Return the active user matching these credentials, or raise a generic 401."""
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    # Runs exactly one bcrypt check whether or not the user exists.
    password_ok = await verify_password_async(password, user.hashed_password if user else None)
    if user is None or not password_ok or not user.is_active:
        raise _invalid_credentials()

    # Upgrade hashes made under a different BCRYPT_ROUNDS; get_db commits it.
    if password_needs_rehash(user.hashed_password):
        user.hashed_password = await hash_password_async(password)

    return user


@router.post("/register", response_model=UserResponse)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == user_in.email))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered")

    # First user gets admin role. UserCreate has no role field, so a client
    # cannot choose one; a "role" key in the body is ignored.
    total_users = await db.scalar(select(func.count(User.id)))
    role = "admin" if total_users == 0 else "viewer"

    user = User(
        email=user_in.email,
        hashed_password=await hash_password_async(user_in.password),
        full_name=user_in.full_name,
        role=role
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/me", response_model=UserResponse)
async def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user


@router.get(
    "/users",
    response_model=list[UserResponse],
    dependencies=[Depends(require_role("admin"))],
)
async def get_all_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.created_at))
    return list(result.scalars().all())


@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    user = await _authenticate(db, form_data.username, form_data.password)
    access_token = create_access_token(data={"sub": str(user.id)})

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


@router.post("/admin-login", response_model=TokenResponse)
async def admin_login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    user = await _authenticate(db, form_data.username, form_data.password)

    # Only reached with valid credentials, so this reveals nothing /login doesn't.
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Admin privileges required.",
        )

    access_token = create_access_token(data={"sub": str(user.id)})

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }
