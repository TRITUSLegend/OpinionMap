from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import make_asgi_app

from app.database import init_db
from app.core.exceptions import AppError, app_error_handler
from app.core.middleware import RequestLoggingMiddleware, PrometheusMiddleware
from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

app = FastAPI(title=settings.APP_NAME, version="1.0.0")

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

@app.on_event("startup")
async def startup_event():
    logger.info("Starting up application...")
    await init_db()

# Add routers with try/except to avoid breaking if not created yet
try:
    from app.api.auth import router as auth_router
    app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
except ImportError:
    pass

try:
    from app.api.workflows import router as workflows_router
    app.include_router(workflows_router, prefix="/api/workflows", tags=["workflows"])
except ImportError:
    pass

try:
    from app.api.reports import router as reports_router
    app.include_router(reports_router, prefix="/api/reports", tags=["reports"])
except ImportError:
    pass

try:
    from app.api.dashboard import router as dashboard_router
    app.include_router(dashboard_router, prefix="/api/dashboard", tags=["dashboard"])
except ImportError:
    pass

try:
    from app.api.rag import router as rag_router
    app.include_router(rag_router, prefix="/api/rag", tags=["rag"])
except ImportError:
    pass

try:
    from app.api.schedule import router as schedule_router
    app.include_router(schedule_router, prefix="/api/schedules", tags=["schedules"])
except ImportError:
    pass

try:
    from app.api.monitoring import router as monitoring_router
    app.include_router(monitoring_router, prefix="/api/monitoring", tags=["monitoring"])
except ImportError:
    pass

try:
    from app.api.admin import router as admin_router
    app.include_router(admin_router, prefix="/api/admin", tags=["admin"])
except ImportError:
    pass

@app.get("/")
async def root():
    return {"name": settings.APP_NAME, "version": "1.0.0", "status": "ok"}
