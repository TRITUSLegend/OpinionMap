import warnings

# google-generativeai is deprecated upstream in favour of the google-genai SDK.
# Migrating is a breaking API change, so silence the import-time FutureWarning
# to keep logs readable until the migration is scheduled. See ARCHITECTURE.md.
# The warning is raised from whichever module does `import google.generativeai`,
# so it must be matched on message rather than module. (?s) makes `.` span the
# newlines the upstream message starts with.
warnings.filterwarnings(
    "ignore",
    category=FutureWarning,
    message=r"(?s).*google\.generativeai.*",
)

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import make_asgi_app

from app.database import init_db
from app.core.exceptions import AppError, app_error_handler
from app.core.middleware import RequestLoggingMiddleware, PrometheusMiddleware
from app.config import settings
from app.core.logging import get_logger

from app.api.auth import router as auth_router
from app.api.workflows import router as workflows_router
from app.api.reports import router as reports_router
from app.api.dashboard import router as dashboard_router
from app.api.rag import router as rag_router
from app.api.schedule import router as schedule_router
from app.api.monitoring import router as monitoring_router
from app.api.admin import router as admin_router

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up application...")

    # Configure Gemini SDK once at startup -- agents reuse this global config
    if settings.GEMINI_API_KEY:
        import google.generativeai as genai
        genai.configure(api_key=settings.GEMINI_API_KEY)
        logger.info("Gemini SDK configured at startup")

    await init_db()
    logger.info(f"{settings.APP_NAME} started successfully")

    yield

    logger.info(f"{settings.APP_NAME} shutting down")


app = FastAPI(title=settings.APP_NAME, version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(PrometheusMiddleware)

app.add_exception_handler(AppError, app_error_handler)

metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(workflows_router, prefix="/api/workflows", tags=["workflows"])
app.include_router(reports_router, prefix="/api/reports", tags=["reports"])
app.include_router(dashboard_router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(rag_router, prefix="/api/rag", tags=["rag"])
app.include_router(schedule_router, prefix="/api/schedules", tags=["schedules"])
app.include_router(monitoring_router, prefix="/api/monitoring", tags=["monitoring"])
app.include_router(admin_router, prefix="/api/admin", tags=["admin"])


@app.get("/")
async def root():
    return {"name": settings.APP_NAME, "version": "1.0.0", "status": "ok"}
