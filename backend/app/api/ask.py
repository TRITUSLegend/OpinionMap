"""
Ask AI endpoints, mounted under /api/workflows next to the workflow routes.

Every route needs a signed-in user who owns the workflow; anyone else gets the
same 404 as a missing workflow, so ids can't be probed.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.logging import get_logger
from app.core.rate_limit import SlidingWindowLimiter
from app.core.sanitizer import find_injection_pattern, safe_query_for_prompt, sanitize_query
from app.core.security import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.workflow import Workflow
from app.schemas.ask import AskRequest, AskResponse, AskStatusResponse
from app.services import ask_service, workflow_service

logger = get_logger(__name__)

router = APIRouter()

limiter = SlidingWindowLimiter(settings.ASK_AI_RATE_LIMIT_PER_MINUTE)


async def _owned_workflow(db: AsyncSession, workflow_id: UUID, user: User) -> Workflow:
    workflow = await workflow_service.get_workflow(db, workflow_id)
    if not workflow or workflow.user_id != user.id:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow


def _clean_question(raw: str) -> str:
    if find_injection_pattern(raw):
        logger.warning("ask_ai_injection_refused", question_preview=raw[:80])
        raise HTTPException(
            status_code=400,
            detail="That reads like an instruction to the AI rather than a question about the data. "
                   "Please ask about the collected comments instead.",
        )
    try:
        clean, _ = sanitize_query(raw)
    except ValueError:
        raise HTTPException(status_code=422, detail="Please type a longer question.")
    return safe_query_for_prompt(clean)


@router.get("/{workflow_id}/ask/status", response_model=AskStatusResponse)
async def ask_status(
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workflow = await _owned_workflow(db, workflow_id, current_user)
    return await ask_service.index_status(db, workflow)


PREPARING = {
    "detail": "Preparing this workflow's data. This can take a minute the first time.",
    "preparing": True,
}


@router.post(
    "/{workflow_id}/ask",
    response_model=AskResponse,
    responses={202: {"description": "The workflow's index is still being built; ask again shortly."}},
)
async def ask(
    workflow_id: UUID,
    body: AskRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not limiter.allow(str(current_user.id)):
        raise HTTPException(
            status_code=429,
            detail="You're asking faster than Ask AI allows. Please wait a minute and try again.",
        )

    question = _clean_question(body.question)
    workflow = await _owned_workflow(db, workflow_id, current_user)
    if workflow.status not in ask_service.READY_STATUSES:
        detail = (
            "This workflow failed, so there is no collected data to ask about."
            if workflow.status == "failed"
            else "This workflow is still running. Ask AI opens once it completes."
        )
        raise HTTPException(status_code=409, detail=detail)

    try:
        return await ask_service.answer_question(db, workflow, question, body.history)
    except ask_service.IndexPreparing:
        return JSONResponse(status_code=202, content=PREPARING, headers={"Retry-After": "10"})
    except ask_service.AskUnavailable as e:
        raise HTTPException(
            status_code=503,
            detail=(
                "Ask AI has reached today's limit for preparing data on the free Gemini tier. "
                "Please try again later."
                if e.daily_quota
                else "Ask AI can't answer right now. Please try again in a minute."
            ),
        )
