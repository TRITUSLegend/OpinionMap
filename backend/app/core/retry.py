"""
Exponential backoff utility for transient API errors.

Used by Gemini-calling agents to avoid blocking the event loop for 60 seconds
on rate-limit responses. Caps at 16 seconds — if the API hasn't recovered by
then, we fall through to the local fallback rather than hanging the worker.
"""

import asyncio
from app.core.logging import get_logger

logger = get_logger(__name__)


async def gemini_backoff(attempt: int, error: Exception, context: str = "") -> None:
    """Async sleep with exponential backoff for Gemini API errors.

    Args:
        attempt: Zero-based attempt number (0 = first failure).
        error:   The exception that triggered the backoff.
        context: Human-readable label for log messages (e.g. "insight_node").
    """
    is_rate_limit = any(
        marker in str(error)
        for marker in ("429", "ResourceExhausted", "quota")
    )

    if is_rate_limit:
        # Exponential: 2s, 4s, 8s, 16s — then give up and use fallback
        wait = min(2 ** (attempt + 1), 16)
        logger.warning(
            f"Gemini rate limit in {context} — backing off {wait}s (attempt {attempt + 1})",
            wait_seconds=wait,
        )
        await asyncio.sleep(wait)
    else:
        # Non-rate-limit error: log and fall through immediately
        logger.error(f"Gemini error in {context} (non-rate-limit): {error}")
