from fastapi import APIRouter, Depends
from app.core.security import require_role

router = APIRouter()

@router.get("/users", dependencies=[Depends(require_role("admin"))])
async def get_users():
    return []

@router.get("/stats", dependencies=[Depends(require_role("admin"))])
async def get_stats():
    return {"status": "ok"}
