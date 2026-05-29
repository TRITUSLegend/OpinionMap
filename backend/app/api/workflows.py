from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from uuid import UUID

from app.database import get_db
from app.core.security import get_current_user
from app.core.sanitizer import sanitize_query, safe_query_for_prompt
from app.models.user import User
from app.schemas.workflow import WorkflowCreate, WorkflowResponse, WorkflowListResponse
from app.services import workflow_service
from app.workers.tasks import execute_workflow_task

router = APIRouter()

@router.post("/", response_model=WorkflowResponse)
async def create_workflow(
    workflow_in: WorkflowCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Sanitize user query before it goes anywhere
    try:
        clean_query, warnings = sanitize_query(workflow_in.query)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Override the raw query with the sanitized version
    workflow_in.query = clean_query
    
    workflow = await workflow_service.create_workflow(db, current_user.id, workflow_in)
    
    # Launch background task with sanitized query
    background_tasks.add_task(
        execute_workflow_task,
        workflow_id=workflow.id,
        query=clean_query,
        sources=workflow.sources,
        user_id=current_user.id
    )
    
    return workflow

@router.get("/", response_model=WorkflowListResponse)
async def list_workflows(
    skip: int = 0,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    workflows, total = await workflow_service.list_workflows(db, current_user.id, skip, limit)
    return {"workflows": workflows, "total": total}

@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    workflow = await workflow_service.get_workflow(db, workflow_id)
    if not workflow or workflow.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow

@router.delete("/{workflow_id}")
async def delete_workflow(
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    workflow = await workflow_service.get_workflow(db, workflow_id)
    if not workflow or workflow.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Workflow not found")
        
    success = await workflow_service.delete_workflow(db, workflow_id)
    return {"success": success}
