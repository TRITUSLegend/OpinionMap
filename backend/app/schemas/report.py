from typing import List, Optional, Any
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime

class ReportBase(BaseModel):
    title: Optional[str] = None

class ReportResponse(ReportBase):
    id: UUID
    workflow_id: UUID
    executive_summary: Optional[str] = None
    sentiment_analysis: Optional[Any] = None
    key_findings: Optional[Any] = None
    competitor_analysis: Optional[Any] = None
    recommendations: Optional[Any] = None
    pain_points: Optional[Any] = None
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ReportListResponse(BaseModel):
    reports: List[ReportResponse]
    total: int
