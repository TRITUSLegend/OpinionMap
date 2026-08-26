from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID

from app.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.dashboard import OverviewMetrics, SentimentData, TrendPoint, KeywordData, CompetitorData
from app.services import dashboard_service

router = APIRouter()

# Dashboard aggregates only change when a workflow completes, so a short
# private cache avoids a refetch storm on every client-side navigation.
_CACHE_CONTROL = "private, max-age=30"

@router.get("/overview", response_model=OverviewMetrics)
async def get_overview(
    response: Response,
    workflow_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    response.headers["Cache-Control"] = _CACHE_CONTROL
    return await dashboard_service.get_overview_metrics(db, current_user.id, workflow_id)

@router.get("/sentiment", response_model=list[SentimentData])
async def get_sentiment(
    response: Response,
    workflow_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    response.headers["Cache-Control"] = _CACHE_CONTROL
    return await dashboard_service.get_sentiment_distribution(db, current_user.id, workflow_id)

@router.get("/trends", response_model=list[TrendPoint])
async def get_trends(
    response: Response,
    workflow_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    response.headers["Cache-Control"] = _CACHE_CONTROL
    return await dashboard_service.get_trend_data(db, current_user.id, workflow_id)

@router.get("/keywords", response_model=list[KeywordData])
async def get_keywords(
    response: Response,
    workflow_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    response.headers["Cache-Control"] = _CACHE_CONTROL
    return await dashboard_service.get_keyword_data(db, current_user.id, workflow_id)

@router.get("/competitors", response_model=list[CompetitorData])
async def get_competitors(
    response: Response,
    workflow_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    response.headers["Cache-Control"] = _CACHE_CONTROL
    return await dashboard_service.get_competitor_data(db, current_user.id, workflow_id)

@router.get("/recent-activity")
async def get_recent_activity(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await dashboard_service.get_recent_activity(db, current_user.id)
