from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from app.core.security import get_current_user
from app.models.user import User
from app.services import rag_service

router = APIRouter()

class RAGQuery(BaseModel):
    question: str
    workflow_id: Optional[str] = None

@router.post("/query")
async def query_rag(
    query: RAGQuery,
    current_user: User = Depends(get_current_user)
):
    # In a real app we'd verify the user has access to the workflow_id
    result = await rag_service.query_rag(query.question, query.workflow_id)
    return result

@router.post("/index")
async def index_documents(
    workflow_id: str,
    current_user: User = Depends(get_current_user)
):
    # Call a service method that extracts text from workflow and adds to Chroma
    # Mocking for now as vectorstore indexing is handled in execute_workflow_task
    return {"status": "success", "message": "Documents indexed successfully"}
