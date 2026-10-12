from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Optional, Any
from uuid import UUID
from jose import jwt, JWTError
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.database import get_db
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(settings.BCRYPT_ROUNDS)).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except ValueError:
        # bcrypt>=5 raises for passwords over 72 bytes and for malformed hashes.
        # Neither can match, so report a failed check instead of a 500.
        return False

def password_needs_rehash(hashed_password: str) -> bool:
    """True when a stored hash was made with a cost other than BCRYPT_ROUNDS."""
    try:
        return int(hashed_password.split("$")[2]) != settings.BCRYPT_ROUNDS
    except (IndexError, ValueError):
        return False

@lru_cache(maxsize=1)
def _dummy_hash() -> str:
    return hash_password("timing-equaliser-never-a-real-password")

# bcrypt is deliberately CPU-heavy. Called directly inside an async handler it
# blocks the event loop, so concurrent logins queue behind each other and every
# other request stalls. These wrappers run it in the threadpool instead.

async def hash_password_async(password: str) -> str:
    return await run_in_threadpool(hash_password, password)

async def verify_password_async(plain_password: str, hashed_password: Optional[str]) -> bool:
    """Verify off the event loop.

    With no stored hash (unknown user) this still performs one bcrypt check, against
    a dummy hash, so response time does not reveal whether an account exists.
    """
    if hashed_password is None:
        await run_in_threadpool(lambda: verify_password(plain_password, _dummy_hash()))
        return False
    return await run_in_threadpool(verify_password, plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    try:
        payload = verify_token(token)
        user_id_str = payload.get("sub")
        if user_id_str is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        user_id = UUID(user_id_str)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    return user

def require_role(*allowed_roles: str):
    async def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operation not permitted"
            )
        return current_user
    return role_checker
