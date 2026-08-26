import json
from datetime import datetime
from uuid import UUID
from sqlalchemy import update

from app.database import async_session_factory
from app.models.workflow import Workflow
from app.models.scraped_data import ScrapedData
from app.models.analytics import Analytics
from app.models.report import Report
from app.models.agent_log import AgentLog
from app.agents.graph import run_workflow
from app.core.logging import get_logger

logger = get_logger(__name__)


async def execute_workflow_task(workflow_id: UUID, query: str, sources: list[str], user_id: UUID):
    logger.info(f"Background task starting for workflow {workflow_id}")

    try:
        async with async_session_factory() as db:
            # Mark workflow as running
            await db.execute(
                update(Workflow)
                .where(Workflow.id == workflow_id)
                .values(status="running", started_at=datetime.utcnow())
            )
            await db.commit()

            # Run LangGraph workflow
            final_state = await run_workflow(query, sources, str(workflow_id))

            # Save scraped data
            for item in final_state.get("cleaned_data", []):
                label = item.get("sentiment_label")
                score = item.get("sentiment_score")

                db_scraped = ScrapedData(
                    workflow_id=workflow_id,
                    source=item.get("source", "unknown"),
                    content=item.get("content", ""),
                    metadata_=item.get("metadata", {}),
                    sentiment_score=score,
                    sentiment_label=label
                )
                db.add(db_scraped)

            # Save analytics
            if final_state.get("sentiment_results"):
                db.add(Analytics(
                    workflow_id=workflow_id,
                    metric_type="sentiment_distribution",
                    metric_data={"results": final_state.get("sentiment_results")}
                ))

            if final_state.get("keywords"):
                db.add(Analytics(
                    workflow_id=workflow_id,
                    metric_type="keyword_frequency",
                    metric_data={"keywords": final_state.get("keywords")}
                ))

            if final_state.get("trends"):
                db.add(Analytics(
                    workflow_id=workflow_id,
                    metric_type="trend_data",
                    metric_data=final_state.get("trends")
                ))

            if final_state.get("competitor_analysis"):
                db.add(Analytics(
                    workflow_id=workflow_id,
                    metric_type="competitor_score",
                    metric_data=final_state.get("competitor_analysis")
                ))

            # Save report
            report_data = final_state.get("report", {})
            if report_data:
                auto_approved = (
                    final_state.get("review_feedback", {}).get("feedback", "") ==
                    "Auto-approved due to max revisions reached."
                )
                report_status = "auto_approved" if auto_approved else (
                    "completed" if final_state.get("review_feedback", {}).get("approved") else "draft"
                )
                db_report = Report(
                    workflow_id=workflow_id,
                    user_id=user_id,
                    title=report_data.get("title", f"Report for {query}"),
                    executive_summary=report_data.get("executive_summary", ""),
                    sentiment_analysis=final_state.get("trends", {}),
                    key_findings=final_state.get("insights", {}),
                    competitor_analysis=final_state.get("competitor_analysis", {}),
                    recommendations=report_data.get("recommendations", []),
                    pain_points=final_state.get("pain_points", []),
                    full_report=json.dumps(report_data),
                    status=report_status
                )
                db.add(db_report)

            # Save agent logs
            agent_states_dict = {}
            for log in final_state.get("agent_logs", []):
                db_log = AgentLog(
                    workflow_id=workflow_id,
                    user_id=user_id,
                    agent_name=log.get("agent_name"),
                    status=log.get("status"),
                    input_data=log.get("input_data"),
                    output_data=log.get("output_data"),
                    execution_time_ms=log.get("execution_time_ms"),
                    started_at=datetime.utcnow()
                )
                db.add(db_log)
                agent_states_dict[log.get("agent_name")] = log.get("status")

            # Finalize workflow
            workflow_status = final_state.get("status", "completed")
            result_summary = report_data.get("executive_summary", "Workflow completed")

            await db.execute(
                update(Workflow)
                .where(Workflow.id == workflow_id)
                .values(
                    status=workflow_status,
                    completed_at=datetime.utcnow(),
                    result_summary=result_summary,
                    agent_states=agent_states_dict
                )
            )

            await db.commit()
            logger.info(f"Background task completed for workflow {workflow_id}")

    except Exception as e:
        logger.error(f"Background task failed for workflow {workflow_id}: {e}")
        try:
            async with async_session_factory() as db:
                await db.execute(
                    update(Workflow)
                    .where(Workflow.id == workflow_id)
                    .values(status="failed", result_summary=str(e), completed_at=datetime.utcnow())
                )
                await db.commit()
        except Exception as inner_e:
            logger.error(f"Failed to update workflow {workflow_id} as failed: {inner_e}")
