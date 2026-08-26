"""
Reviewer agent — local quality validation gate.

Replaces the prior Gemini-based reviewer with a deterministic local check.
This eliminates one API round-trip (and the potential retry loop it caused)
while still fulfilling the reviewer's contract: populate state["review_feedback"]
with {approved, feedback, quality_score} so the LangGraph conditional edge works.

Validation criteria (all must pass to approve):
  1. Report dict is non-empty and has a "title" key.
  2. "executive_summary" is present and at least 100 characters long.
  3. "recommendations" is a non-empty list.
  4. "sections" is a dict with at least 3 entries, each non-empty.
  5. No placeholder patterns detected ("Competitor A", "keyword_0", "[keyword]").
"""

import time
import re

from app.agents.state import AgentState
from app.core.logging import get_logger

logger = get_logger(__name__)

# Strings that indicate the report contains unfilled template placeholders
_PLACEHOLDER_PATTERNS = [
    r"Competitor [A-C]\b",
    r"keyword_\d+",
    r"\[keyword\]",
    r"\[query\]",
    r"Leading competitors to \{",
    r"Issues with \[",
]
_PLACEHOLDER_RE = re.compile("|".join(_PLACEHOLDER_PATTERNS), re.IGNORECASE)


def _validate_report(report: dict) -> tuple[bool, str, float]:
    """Run local quality checks. Returns (approved, feedback, quality_score)."""

    if not report or not isinstance(report, dict):
        return False, "Report is empty or malformed.", 0.0

    title = report.get("title", "")
    if not title:
        return False, "Report is missing a title.", 0.1

    summary = report.get("executive_summary", "")
    if len(summary) < 100:
        return False, (
            f"Executive summary is too short ({len(summary)} chars). "
            "Minimum 100 characters required."
        ), 0.3

    recommendations = report.get("recommendations", [])
    if not recommendations or not isinstance(recommendations, list):
        return False, "Report has no recommendations.", 0.4

    sections = report.get("sections", {})
    if not sections or not isinstance(sections, dict):
        return False, "Report has no sections.", 0.4

    non_empty_sections = [k for k, v in sections.items() if v and len(str(v)) > 20]
    if len(non_empty_sections) < 3:
        return False, (
            f"Only {len(non_empty_sections)} non-empty section(s) found. "
            "At least 3 required."
        ), 0.5

    # Placeholder detection — scan title + summary + all section values
    scan_target = " ".join([
        title, summary,
        " ".join(str(v) for v in sections.values()),
        " ".join(str(r) for r in recommendations),
    ])
    match = _PLACEHOLDER_RE.search(scan_target)
    if match:
        return False, (
            f"Report contains placeholder text: '{match.group()}'. "
            "Real content required."
        ), 0.4

    # All checks passed — score based on content richness
    score = min(1.0, 0.7 + (len(non_empty_sections) / 20) + (min(len(summary), 500) / 2000))
    return True, "Local validation passed — report meets quality criteria.", round(score, 2)


async def reviewer_node(state: AgentState) -> AgentState:
    logger.info("Agent starting: Reviewer (local validation)", workflow_id=state.get("workflow_id"))
    state["current_agent"] = "reviewer"
    start_time = time.time()

    report = state.get("report", {})
    revision_count = state.get("revision_count", 0)

    # Increment before checking so the graph's retry ceiling works as before
    state["revision_count"] = revision_count + 1

    # Hard ceiling — prevent infinite loops regardless of validation result
    if revision_count >= 2:
        logger.warning(
            "Max revisions reached — auto-approving",
            workflow_id=state.get("workflow_id"),
            revision_count=revision_count,
        )
        state["review_feedback"] = {
            "approved": True,
            "feedback": "Auto-approved due to max revisions reached.",
            "quality_score": 0.7,
        }
        state["status"] = "auto_approved"
    else:
        approved, feedback, quality_score = _validate_report(report)
        state["review_feedback"] = {
            "approved": approved,
            "feedback": feedback,
            "quality_score": quality_score,
        }
        if approved:
            state["status"] = "completed"
            logger.info(
                "Report approved by local validator",
                quality_score=quality_score,
                workflow_id=state.get("workflow_id"),
            )
        else:
            logger.warning(
                "Report failed local validation — sending back for revision",
                feedback=feedback,
                workflow_id=state.get("workflow_id"),
            )

    execution_time = int((time.time() - start_time) * 1000)

    if "agent_logs" not in state:
        state["agent_logs"] = []

    state["agent_logs"].append({
        "agent_name": "reviewer",
        "status": "completed",
        "input_data": {"revision_count": revision_count},
        "output_data": {
            "approved": state["review_feedback"]["approved"],
            "quality_score": state["review_feedback"]["quality_score"],
        },
        "execution_time_ms": execution_time,
    })

    return state
