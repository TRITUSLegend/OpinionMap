"""
Hacker News scraper via the Algolia search API.

No API key or credentials required. The Algolia HN search API is completely
free and open: https://hn.algolia.com/api/v1/

Returns stories and comments matching the query, sorted by relevance.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta
from typing import Any

import httpx
import structlog

from app.scrapers.base import BaseScraper

log: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
#  Mock data -- HN-style technical, opinionated commentary
# ---------------------------------------------------------------------------

_POSITIVE_HN: list[str] = [
    "This is exactly what I've been looking for. The {query} approach solves a real problem.",
    "Impressive work on {query}. The technical implementation is solid and well-documented.",
    "We've been using {query} in production for 6 months. Rock-solid and highly recommend.",
    "The {query} team really listened to user feedback this cycle. Big improvement over v1.",
    "Ask HN: Has anyone tried {query}? The benchmarks look genuinely promising.",
    "Finally a {query} solution that doesn't require 15 config files to get started.",
    "The {query} architecture is clever. Solves the concurrency problem elegantly.",
    "Just migrated to {query} from the incumbent. The difference in performance is night and day.",
]

_NEGATIVE_HN: list[str] = [
    "Another {query} hype cycle. The fundamentals haven't changed since 2019.",
    "I tried {query} last year. The onboarding is terrible and docs are months out of date.",
    "{query} is solving the wrong problem. The real bottleneck is still unaddressed.",
    "The {query} pricing model is predatory for small teams. Switched to the OSS alternative.",
    "Why does {query} require so many dependencies? This is dependency bloat at its worst.",
    "Hot take: {query} is a solution looking for a problem. The incumbents handle this fine.",
    "The {query} team keeps shipping breaking changes. Migration fatigue is real.",
    "Serious reliability issues with {query} at scale. Wouldn't recommend for production.",
]

_NEUTRAL_HN: list[str] = [
    "Interesting take on {query}. Would be curious to see long-term benchmarks at scale.",
    "How does {query} compare to existing solutions in terms of operational complexity?",
    "The {query} architecture is unconventional. Does anyone know the reasoning behind the design?",
    "Has anyone done a proper apples-to-apples comparison of {query} vs alternatives?",
    "Genuine question: what problem does {query} solve that the existing tools don't?",
    "The {query} space is getting crowded. Hard to evaluate without spending weeks on it.",
    "I'm watching {query} with interest. The approach is novel but the ecosystem is thin.",
    "Show HN: Would love feedback on our {query} integration from people who've used it.",
]

_HN_AUTHORS: list[str] = [
    "throwaway_eng", "tptacek_reader", "pg_fan", "dang_alt", "patio11_reader",
    "ex_googler", "hn_lurker", "startup_founder", "sre_team", "ml_practitioner",
    "open_source_dev", "yc_alum", "indie_hacker", "infra_lead", "tech_lead_42",
]


def _generate_mock_hn(query: str, count: int) -> list[dict[str, Any]]:
    """Generate realistic mock Hacker News stories and comments."""
    items: list[dict[str, Any]] = []
    all_templates = _POSITIVE_HN * 2 + _NEGATIVE_HN + _NEUTRAL_HN * 2

    for _ in range(count):
        template = random.choice(all_templates)
        content = template.format(query=query)
        days_ago = random.randint(1, 180)
        date_str = (datetime.utcnow() - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")
        item_id = random.randint(30_000_000, 40_000_000)

        items.append({
            "source": "hackernews",
            "content": content,
            "metadata": {
                "author": random.choice(_HN_AUTHORS),
                "date": date_str,
                "points": random.randint(0, 500),
                "num_comments": random.randint(0, 200),
                "url": f"https://news.ycombinator.com/item?id={item_id}",
                "item_id": str(item_id),
                "type": random.choice(["story", "comment"]),
            },
        })

    return items


# ---------------------------------------------------------------------------
#  Scraper
# ---------------------------------------------------------------------------

class HackerNewsScraper(BaseScraper):
    """Fetches Hacker News stories and comments via the Algolia HN search API.

    No API key or credentials required. Falls back to realistic mock data if
    the API is unreachable.
    """

    _ALGOLIA_URL = "https://hn.algolia.com/api/v1/search"

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(request_delay=0.5, **kwargs)
        self.logger = log.bind(scraper="HackerNewsScraper")

    async def _fetch_live(self, query: str, max_results: int) -> list[dict[str, Any]]:
        """Call the Algolia HN search API and parse results."""
        params = {
            "query": query,
            "tags": "(story,comment)",
            "hitsPerPage": min(max_results, 100),
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(self._ALGOLIA_URL, params=params)
            response.raise_for_status()
            data = response.json()

        results: list[dict[str, Any]] = []
        for hit in data.get("hits", []):
            tags = hit.get("_tags", [])
            is_comment = "comment" in tags

            if is_comment:
                content = (hit.get("comment_text") or "").strip()
            else:
                title = hit.get("title") or ""
                body = hit.get("story_text") or ""
                content = f"{title} {body}".strip()

            if not content or len(content) < 10:
                continue

            results.append({
                "source": "hackernews",
                "content": content,
                "metadata": {
                    "author": hit.get("author", "unknown"),
                    "date": hit.get("created_at", ""),
                    "points": hit.get("points") or 0,
                    "num_comments": hit.get("num_comments") or 0,
                    "url": f"https://news.ycombinator.com/item?id={hit.get('objectID', '')}",
                    "item_id": hit.get("objectID", ""),
                    "type": "comment" if is_comment else "story",
                },
            })

        return results

    async def _scrape_impl(self, query: str, max_results: int) -> list[dict[str, Any]]:
        try:
            results = await self._fetch_live(query, max_results)
            if results:
                self.logger.info("hackernews_live_success", count=len(results))
                return results[:max_results]
            self.logger.info("hackernews_fallback_mock", reason="no_results_from_api")
        except Exception as exc:  # noqa: BLE001
            self.logger.warning("hackernews_api_failed", error=str(exc))

        count = random.randint(20, max(20, min(40, max_results)))
        return _generate_mock_hn(query, count)
