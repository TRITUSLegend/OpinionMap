import re
from pydantic import BaseModel, ConfigDict, Field, field_validator
from uuid import UUID
from datetime import datetime
from typing import Optional

EMAIL_PATTERN = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
PASSWORD_MIN_LENGTH = 8
# bcrypt only reads the first 72 bytes and bcrypt>=5 raises on longer input,
# so reject it here as a validation error rather than failing in the hash call.
PASSWORD_MAX_BYTES = 72

class UserBase(BaseModel):
    email: str
    full_name: str

class UserCreate(UserBase):
    email: str = Field(..., max_length=255)
    full_name: str = Field(..., max_length=255)
    password: str = Field(..., min_length=PASSWORD_MIN_LENGTH)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        # Case is preserved: login matches emails exactly, and existing
        # accounts may have been registered with mixed case.
        v = v.strip()
        if not EMAIL_PATTERN.match(v):
            raise ValueError("Enter a valid email address")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v.encode("utf-8")) > PASSWORD_MAX_BYTES:
            raise ValueError(f"Password must be at most {PASSWORD_MAX_BYTES} bytes")
        return v

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Full name is required")
        return v

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    # The column is nullable; a NULL name must not turn into a 500.
    full_name: Optional[str] = None
    role: str
    is_active: bool
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse
