from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import psutil
import os

from app.database import get_db
from app.core.security import get_current_user, require_role
from app.models.user import User

router = APIRouter()

@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "error"
        
    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "database": db_status
    }

@router.get("/system", dependencies=[Depends(require_role("admin"))])
async def get_system_stats():
    return {
        "cpu_percent": psutil.cpu_percent(),
        "memory_percent": psutil.virtual_memory().percent,
        "pid": os.getpid()
    }
    
@router.get("/agents", dependencies=[Depends(require_role("admin"))])
async def get_agent_logs(db: AsyncSession = Depends(get_db)):
    # Quick mock, real implementation would query AgentLog
    return []
