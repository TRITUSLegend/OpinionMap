"""
AgentFlow AI - Application Configuration

Loads all settings from environment variables and .env file using pydantic-settings.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Database
    # Postgres (via Docker Compose) is the intended runtime -- see .env.example.
    # The SQLite URL below is ONLY a local-dev fallback used when DATABASE_URL is unset,
    # so the app still boots for a quick local demo without a running Postgres instance.
    DATABASE_URL: str = "sqlite+aiosqlite:///./agentflow.db"

    # AI / LLM
    GEMINI_API_KEY: str = ""

    # JWT Authentication
    JWT_SECRET_KEY: str = "super-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # YouTube Data API
    YOUTUBE_API_KEY: str = ""

    # Reddit API
    REDDIT_CLIENT_ID: str = ""
    REDDIT_CLIENT_SECRET: str = ""
    REDDIT_USER_AGENT: str = "AgentFlow/1.0"

    # ChromaDB
    CHROMA_PERSIST_DIR: str = "./chroma_data"

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost", "http://localhost:3000", "https://localhost"]

    APP_NAME: str = "OpinionMap"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"


settings = Settings()
