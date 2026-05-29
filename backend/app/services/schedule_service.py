from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.scheduled_task import ScheduledTask
from app.schemas.schedule import ScheduleCreate

async def create_schedule(db: AsyncSession, user_id, schedule_data: ScheduleCreate) -> ScheduledTask:
    schedule = ScheduledTask(
        user_id=user_id,
        name=schedule_data.name,
        query=schedule_data.query,
        schedule_type=schedule_data.schedule_type,
        cron_expression=schedule_data.cron_expression,
        sources=schedule_data.sources,
        is_active=True
    )
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    return schedule

async def list_schedules(db: AsyncSession, user_id) -> list[ScheduledTask]:
    result = await db.execute(select(ScheduledTask).where(ScheduledTask.user_id == user_id))
    return list(result.scalars().all())

async def deactivate_schedule(db: AsyncSession, schedule_id) -> bool:
    result = await db.execute(select(ScheduledTask).where(ScheduledTask.id == schedule_id))
    schedule = result.scalar_one_or_none()
    if schedule:
        schedule.is_active = False
        await db.commit()
        return True
    return False
