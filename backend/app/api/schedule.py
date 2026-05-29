from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.schedule import ScheduleCreate, ScheduleResponse
from app.services import schedule_service

router = APIRouter()

@router.post("/", response_model=ScheduleResponse)
async def create_schedule(
    schedule_in: ScheduleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    schedule = await schedule_service.create_schedule(db, current_user.id, schedule_in)
    return schedule

@router.get("/", response_model=List[ScheduleResponse])
async def list_schedules(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    schedules = await schedule_service.list_schedules(db, current_user.id)
    return schedules

@router.delete("/{schedule_id}")
async def deactivate_schedule(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    success = await schedule_service.deactivate_schedule(db, schedule_id)
    if not success:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"success": True}
