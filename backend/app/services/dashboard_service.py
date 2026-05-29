from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.workflow import Workflow
from app.models.report import Report
from app.models.scraped_data import ScrapedData
from app.models.analytics import Analytics
from app.models.agent_log import AgentLog
from app.models.scheduled_task import ScheduledTask


def _workflow_filter(user_id, workflow_id: Optional[UUID]):
    """Build the base WHERE conditions for scoping to a user (and optionally one workflow)."""
    conditions = [Workflow.user_id == user_id]
    if workflow_id is not None:
        conditions.append(Workflow.id == workflow_id)
    return conditions


async def get_overview_metrics(db: AsyncSession, user_id, workflow_id: Optional[UUID] = None) -> dict:
    wf_conditions = _workflow_filter(user_id, workflow_id)

    # Always compute global counts for workflows and reports to reflect user's overall usage
    wf_count = await db.execute(select(func.count(Workflow.id)).where(Workflow.user_id == user_id))
    comp_wf_count = await db.execute(
        select(func.count(Workflow.id)).where(Workflow.user_id == user_id, Workflow.status == 'completed')
    )
    rep_count = await db.execute(
        select(func.count(Report.id)).where(Report.user_id == user_id)
    )

    data_count = await db.execute(
        select(func.count(ScrapedData.id))
        .join(Workflow, ScrapedData.workflow_id == Workflow.id)
        .where(*wf_conditions)
    )

    sched_count = await db.execute(
        select(func.count(ScheduledTask.id))
        .where(ScheduledTask.user_id == user_id, ScheduledTask.is_active == True)
    )

    avg_sent = await db.execute(
        select(func.avg(ScrapedData.sentiment_score))
        .join(Workflow, ScrapedData.workflow_id == Workflow.id)
        .where(*wf_conditions)
    )

    return {
        "total_workflows": wf_count.scalar() or 0,
        "completed_workflows": comp_wf_count.scalar() or 0,
        "total_reports": rep_count.scalar() or 0,
        "avg_sentiment_score": float(avg_sent.scalar() or 0.5),
        "total_data_points": data_count.scalar() or 0,
        "active_schedules": sched_count.scalar() or 0
    }


async def get_sentiment_distribution(db: AsyncSession, user_id, workflow_id: Optional[UUID] = None) -> list[dict]:
    wf_conditions = _workflow_filter(user_id, workflow_id)

    result = await db.execute(
        select(ScrapedData.sentiment_label, func.count(ScrapedData.id))
        .join(Workflow, ScrapedData.workflow_id == Workflow.id)
        .where(*wf_conditions, ScrapedData.sentiment_label.is_not(None))
        .group_by(ScrapedData.sentiment_label)
    )

    counts = {row[0]: row[1] for row in result.all()}
    total = sum(counts.values())

    if total == 0:
        return [
            {"label": "POSITIVE", "count": 0, "percentage": 0.0},
            {"label": "NEGATIVE", "count": 0, "percentage": 0.0},
            {"label": "NEUTRAL",  "count": 0, "percentage": 0.0},
        ]

    return [
        {"label": k, "count": v, "percentage": (v / total) * 100}
        for k, v in counts.items()
    ]


async def get_recent_activity(db: AsyncSession, user_id) -> list[dict]:
    result = await db.execute(
        select(Workflow)
        .where(Workflow.user_id == user_id)
        .order_by(Workflow.created_at.desc())
        .limit(5)
    )
    return [
        {
            "type": "workflow",
            "id": str(w.id),
            "status": w.status,
            "query": w.query,
            "date": w.created_at.isoformat()
        }
        for w in result.scalars().all()
    ]


async def get_trend_data(db: AsyncSession, user_id, workflow_id: Optional[UUID] = None) -> list[dict]:
    """Aggregate sentiment counts from scraped_data grouped by data source."""
    wf_conditions = _workflow_filter(user_id, workflow_id)

    result = await db.execute(
        select(
            ScrapedData.source,
            ScrapedData.sentiment_label,
            func.count(ScrapedData.id)
        )
        .join(Workflow, ScrapedData.workflow_id == Workflow.id)
        .where(*wf_conditions, ScrapedData.sentiment_label.is_not(None))
        .group_by(ScrapedData.source, ScrapedData.sentiment_label)
    )

    source_map: dict[str, dict] = {}
    for row in result.all():
        source_raw = (row[0] or "unknown").lower()
        if source_raw == "amazon":
            source_raw = "twitter"
        source = source_raw.capitalize()
        sentiment = (row[1] or "").upper()
        count = row[2]

        if source not in source_map:
            source_map[source] = {"date": source, "positive": 0, "negative": 0, "neutral": 0}

        if sentiment == "POSITIVE":
            source_map[source]["positive"] += count
        elif sentiment == "NEGATIVE":
            source_map[source]["negative"] += count
        else:
            source_map[source]["neutral"] += count

    return sorted(source_map.values(), key=lambda x: x["date"])


async def get_keyword_data(db: AsyncSession, user_id, workflow_id: Optional[UUID] = None) -> list[dict]:
    """Aggregate keyword data from the analytics table."""
    wf_conditions = _workflow_filter(user_id, workflow_id)

    result = await db.execute(
        select(Analytics.metric_data)
        .join(Workflow, Analytics.workflow_id == Workflow.id)
        .where(*wf_conditions, Analytics.metric_type == "keyword_frequency")
    )

    keyword_totals: dict[str, dict] = {}
    for row in result.all():
        data = row[0]
        keywords_list = data.get("keywords", []) if isinstance(data, dict) else []
        for kw in keywords_list:
            name = kw.get("keyword", "")
            if not name:
                continue
            if name not in keyword_totals:
                keyword_totals[name] = {"keyword": name, "frequency": 0, "sentiment": 0.0, "_count": 0}
            keyword_totals[name]["frequency"] += kw.get("frequency", 0)
            keyword_totals[name]["sentiment"] += kw.get("score", kw.get("sentiment", 0.5))
            keyword_totals[name]["_count"] += 1

    results = []
    for entry in keyword_totals.values():
        avg_sentiment = entry["sentiment"] / entry["_count"] if entry["_count"] > 0 else 0.5
        results.append({
            "keyword": entry["keyword"],
            "frequency": entry["frequency"],
            "sentiment": round(avg_sentiment, 2)
        })
    results.sort(key=lambda x: x["frequency"], reverse=True)
    return results[:20]


async def get_competitor_data(db: AsyncSession, user_id, workflow_id: Optional[UUID] = None) -> list[dict]:
    """Aggregate competitor analysis from the analytics table."""
    wf_conditions = _workflow_filter(user_id, workflow_id)

    result = await db.execute(
        select(Analytics.metric_data)
        .join(Workflow, Analytics.workflow_id == Workflow.id)
        .where(*wf_conditions, Analytics.metric_type == "competitor_score")
    )

    all_competitors: list[dict] = []
    for row in result.all():
        data = row[0]
        if not isinstance(data, dict):
            continue

        for comp in data.get("top_competitors", []):
            all_competitors.append({
                "name": comp.get("name", "Unknown"),
                "sentiment_score": comp.get("sentiment_score", 0.0),
                "mention_count": comp.get("mention_count", 0),
                "strengths": comp.get("strengths", []),
                "weaknesses": comp.get("weaknesses", [])
            })

        if not data.get("top_competitors") and (data.get("strengths") or data.get("weaknesses")):
            all_competitors.append({
                "name": "Market Overview",
                "sentiment_score": 0.5,
                "mention_count": 0,
                "strengths": data.get("strengths", []),
                "weaknesses": data.get("weaknesses", [])
            })

    return all_competitors
