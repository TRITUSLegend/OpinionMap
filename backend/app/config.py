"""
OpinionMap - Application configuration

Loads all settings from environment variables and .env file using pydantic-settings.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        # .env is shared with docker-compose, so it holds keys this class does not
        # model (POSTGRES_*, PROMETHEUS_PORT, GRAFANA_*). pydantic-settings loads
        # every key from a dotenv file and validates it, so without extra="ignore"
        # those keys raise extra_forbidden and the app fails to start.
        extra="ignore",
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
    # 480 minutes (8 hours): the previous 30-minute expiry logged users out
    # mid-session, and there is no refresh-token flow to recover from it.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # YouTube Data API
    YOUTUBE_API_KEY: str = ""

    # Reddit API
    REDDIT_CLIENT_ID: str = ""
    REDDIT_CLIENT_SECRET: str = ""
    REDDIT_USER_AGENT: str = "OpinionMap/1.0"

    # NewsData.io API
    NEWSDATA_API_KEY: str = ""

    # The Guardian API
    GUARDIAN_API_KEY: str = ""

    # Bluesky (AT Protocol) -- required for live search
    # app.bsky.feed.searchPosts returns 403 unauthenticated; without these the
    # Bluesky scraper falls back to mock data
    BLUESKY_IDENTIFIER: str = ""    # your handle, e.g. yourname.bsky.social
    BLUESKY_APP_PASSWORD: str = ""  # Bluesky app password (not your main password)
    # Hacker News API needs no credentials -- no field needed

    # ChromaDB
    CHROMA_PERSIST_DIR: str = "./chroma_data"

    # ChromaDB connection (set by Docker Compose). Declared so the values
    # compose injects are recognised rather than ignored; the RAG store
    # currently uses PersistentClient(CHROMA_PERSIST_DIR), not this host/port.
    CHROMA_HOST: str = "localhost"
    CHROMA_PORT: int = 8000

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost", "http://localhost:3000", "https://localhost"]

    APP_NAME: str = "OpinionMap"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"


settings = Settings()
