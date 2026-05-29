from typing import List, Optional
from pydantic import BaseModel

class OverviewMetrics(BaseModel):
    total_workflows: int
    completed_workflows: int
    total_reports: int
    avg_sentiment_score: float
    total_data_points: int
    active_schedules: int

class SentimentData(BaseModel):
    label: str
    count: int
    percentage: float

class TrendPoint(BaseModel):
    date: str
    positive: float
    negative: float
    neutral: float

class KeywordData(BaseModel):
    keyword: str
    frequency: int
    sentiment: float

class CompetitorData(BaseModel):
    name: str
    sentiment_score: float
    mention_count: int
    strengths: List[str]
    weaknesses: List[str]
