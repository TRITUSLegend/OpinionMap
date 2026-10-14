"""
OpinionMap - Application configuration

Loads all settings from environment variables and .env file using pydantic-settings.
"""

from pydantic import Field
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

    # bcrypt work factor for new password hashes. Each step doubles the cost
    # (~180 ms at 12 on one desktop core, roughly 10x that on a 0.1-CPU
    # instance). Stored hashes made with a different value are re-hashed on the
    # user's next successful login. Values below 10 are rejected.
    BCRYPT_ROUNDS: int = Field(default=12, ge=10, le=15)

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

    # ChromaDB server (Docker Compose sets CHROMA_HOST=chromadb). When the host
    # is empty, or the server can't be reached at startup, the vector store
    # uses a local PersistentClient(CHROMA_PERSIST_DIR) instead.
    CHROMA_HOST: str = ""
    CHROMA_PORT: int = 8000

    # Embeddings (Ask AI and /api/rag). text-embedding-004 was retired; 768
    # dimensions keeps vectors the size the old model produced.
    EMBEDDING_MODEL: str = "models/gemini-embedding-001"
    EMBEDDING_DIM: int = 768
    # The free tier rejected a 100-text batch with a 429; 50 went through.
    EMBEDDING_BATCH_SIZE: int = Field(default=50, ge=1, le=100)

    # Ask AI (questions answered from one workflow's collected comments)
    ASK_AI_TOP_K: int = Field(default=8, ge=1, le=20)
    # Best cosine similarity a question needs before Gemini is called at all.
    # On a real 176-item workflow, clearly off-topic questions peaked at 0.594
    # and covered ones started at 0.625 (docs/ASK_AI_PLAN.md, section 4).
    ASK_AI_MIN_SIMILARITY: float = Field(default=0.6, ge=0.0, le=1.0)
    # Caps embedding calls per workflow to protect the free-tier quota.
    ASK_AI_MAX_CHUNKS: int = Field(default=400, ge=1)
    # How long a question waits for a missing index to be built before the API
    # answers 202 "preparing" (the build carries on in the background). The
    # free tier embeds 100 texts a minute, so a large workflow can take longer.
    ASK_AI_INDEX_WAIT_SECONDS: float = Field(default=25.0, ge=0.0)
    # Embed each workflow as soon as its run completes. The free tier embeds
    # 1,000 texts a day (about 3-6 workflows), so false saves the quota for
    # workflows someone actually asks about: they're indexed on first question.
    ASK_AI_INDEX_ON_COMPLETE: bool = True
    ASK_AI_RATE_LIMIT_PER_MINUTE: int = Field(default=10, ge=1)

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost", "http://localhost:3000", "https://localhost"]

    APP_NAME: str = "OpinionMap"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"


settings = Settings()
