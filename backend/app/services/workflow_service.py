from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from app.models.workflow import Workflow
from app.schemas.workflow import WorkflowCreate

async def create_workflow(db: AsyncSession, user_id, workflow_data: WorkflowCreate) -> Workflow:
    workflow = Workflow(
        user_id=user_id,
        query=workflow_data.query,
        sources=workflow_data.sources,
        status="pending"
    )
    db.add(workflow)
    await db.commit()
    await db.refresh(workflow)
    return workflow

async def get_workflow(db: AsyncSession, workflow_id) -> Workflow | None:
    result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    return result.scalar_one_or_none()

async def list_workflows(db: AsyncSession, user_id, skip: int = 0, limit: int = 100) -> tuple[list[Workflow], int]:
    result = await db.execute(
        select(Workflow)
        .where(Workflow.user_id == user_id)
        .order_by(Workflow.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    workflows = list(result.scalars().all())
    
    count_result = await db.execute(select(func.count(Workflow.id)).where(Workflow.user_id == user_id))
    total = count_result.scalar()
    
    return workflows, total

async def delete_workflow(db: AsyncSession, workflow_id) -> bool:
    # Cascade delete all related records to avoid foreign key violations
    from app.models.report import Report
    from app.models.scraped_data import ScrapedData
    from app.models.agent_log import AgentLog
    from app.models.analytics import Analytics
    from app.models.embedding_metadata import EmbeddingMetadata
    
    await db.execute(delete(EmbeddingMetadata).where(EmbeddingMetadata.workflow_id == workflow_id))
    await db.execute(delete(Analytics).where(Analytics.workflow_id == workflow_id))
    await db.execute(delete(AgentLog).where(AgentLog.workflow_id == workflow_id))
    await db.execute(delete(ScrapedData).where(ScrapedData.workflow_id == workflow_id))
    await db.execute(delete(Report).where(Report.workflow_id == workflow_id))
    
    result = await db.execute(delete(Workflow).where(Workflow.id == workflow_id))
    await db.commit()
    return result.rowcount > 0
