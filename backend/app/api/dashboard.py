from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID

from app.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.dashboard import OverviewMetrics, SentimentData, TrendPoint, KeywordData, CompetitorData
from app.services import dashboard_service

router = APIRouter()

@router.get("/overview", response_model=OverviewMetrics)
async def get_overview(
    workflow_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await dashboard_service.get_overview_metrics(db, current_user.id, workflow_id)

@router.get("/sentiment", response_model=list[SentimentData])
async def get_sentiment(
    workflow_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await dashboard_service.get_sentiment_distribution(db, current_user.id, workflow_id)

@router.get("/trends", response_model=list[TrendPoint])
async def get_trends(
    workflow_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await dashboard_service.get_trend_data(db, current_user.id, workflow_id)

@router.get("/keywords", response_model=list[KeywordData])
async def get_keywords(
    workflow_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await dashboard_service.get_keyword_data(db, current_user.id, workflow_id)

@router.get("/competitors", response_model=list[CompetitorData])
async def get_competitors(
    workflow_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await dashboard_service.get_competitor_data(db, current_user.id, workflow_id)

@router.get("/recent-activity")
async def get_recent_activity(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await dashboard_service.get_recent_activity(db, current_user.id)
