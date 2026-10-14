from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user
from app.database import get_db
from app.models.user import User
from app.rag.indexer import schedule_workflow_index
from app.services import rag_service, workflow_service

# Legacy endpoints. Ask AI (/api/workflows/{id}/ask) supersedes them with
# cited, validated answers; these keep their request and response shapes.

router = APIRouter()

class RAGQuery(BaseModel):
    question: str
    workflow_id: Optional[str] = None

async def _owned_workflow_id(db: AsyncSession, workflow_id: str, user: User) -> UUID:
    # Same rule as the workflow routes: a missing workflow and someone else's
    # look identical (404), and only a server-verified UUID names a collection.
    try:
        wf_id = UUID(workflow_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Workflow not found")
    workflow = await workflow_service.get_workflow(db, wf_id)
    if not workflow or workflow.user_id != user.id:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return wf_id

@router.post("/query")
async def query_rag(
    query: RAGQuery,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    workflow_id = await _owned_workflow_id(db, query.workflow_id, current_user) if query.workflow_id else None
    result = await rag_service.query_rag(query.question, workflow_id)
    return result

@router.post("/index")
async def index_documents(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Embeds the workflow's collected comments into its collection in the
    # background (the same index Ask AI uses; already-stored chunks are skipped).
    wf_id = await _owned_workflow_id(db, workflow_id, current_user)
    schedule_workflow_index(wf_id)
    return {"status": "success", "message": "Indexing started"}
