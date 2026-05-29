from typing import List, Optional
from pydantic import BaseModel, ConfigDict, field_validator
from uuid import UUID
from datetime import datetime


class WorkflowBase(BaseModel):
    query: str
    sources: List[str] = ["twitter", "youtube", "reddit"]

    @field_validator("query")
    @classmethod
    def validate_query(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Query cannot be empty.")
        if len(v) < 2:
            raise ValueError("Query is too short. Enter a valid product or topic.")
        if len(v) > 500:
            raise ValueError("Query is too long (max 500 characters).")
        return v


class WorkflowCreate(WorkflowBase):
    pass

class WorkflowResponse(WorkflowBase):
    id: UUID
    status: str
    result_summary: Optional[str] = None
    agent_states: Optional[dict] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class WorkflowListResponse(BaseModel):
    workflows: List[WorkflowResponse]
    total: int
