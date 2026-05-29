from typing import TypedDict, Optional, Any, List

class AgentState(TypedDict):
    query: str
    workflow_id: str
    sources: List[str]
    raw_data: List[dict]
    cleaned_data: List[dict]
    sentiment_results: List[dict]
    topics: List[dict]
    keywords: List[dict]
    trends: dict
    insights: dict
    competitor_analysis: dict
    pain_points: List[dict]
    report: dict
    review_feedback: dict
    status: str
    errors: List[str]
    agent_logs: List[dict]
    current_agent: str
    revision_count: int
