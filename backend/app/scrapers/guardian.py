"""
The Guardian scraper via the official Content API.

Free tier: 5,000 requests/day, full article body text (no HTML).
Register for a free API key at: https://open-platform.theguardian.com

Set GUARDIAN_API_KEY in your .env to enable live mode.
Falls back to realistic mock articles when the key is absent or the API fails.
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
#  Mock data -- Guardian-style analytical journalism
# ---------------------------------------------------------------------------

_POSITIVE_GRD: list[str] = [
    "{query}: Why the Critics Are Wrong and the Optimists Have a Genuine Point",
    "The Case For {query}: A Considered and Evidence-Based Assessment",
    "How {query} Is Quietly Transforming Its Sector -- and Why That Matters",
    "{query} Demonstrates That Innovation and Social Responsibility Can Coexist",
    "In Praise of {query}: The Story the Business Press Has Been Missing",
    "The Quiet Success of {query}: What the Sceptics Got Wrong",
]

_NEGATIVE_GRD: list[str] = [
    "{query}: The Uncomfortable Questions That Deserve Honest Answers",
    "Behind the {query} Success Story, a More Complex Picture Emerges",
    "Why the {query} Record Deserves More Scrutiny Than It Currently Receives",
    "{query} and the Accountability Gap: Our Investigation Finds Serious Concerns",
    "The Workers Behind {query}: Stories the Company Would Rather You Did Not Read",
    "The {query} Environmental Footprint: The Numbers Are Worse Than They Look",
]

_NEUTRAL_GRD: list[str] = [
    "{query}: Everything You Need to Know About the Latest Controversy",
    "The {query} Debate, Explained: The Arguments From Both Sides",
    "What Does the Growing Influence of {query} Mean for Ordinary People?",
    "{query} at a Crossroads: The Decisions That Will Shape Its Next Chapter",
    "A Comprehensive Guide to {query}: History, Context, and What Comes Next",
    "{query}: Reading Between the Lines of the Official Narrative",
]

_GRD_AUTHORS: list[str] = [
    "Guardian Technology", "Guardian Business Desk", "Staff Reporter",
    "Environment Correspondent", "Media Editor", "Science Correspondent",
    "Consumer Affairs Reporter", "Political Correspondent", "Data Projects Team",
]

_GRD_SECTIONS: list[str] = [
    "Technology", "Business", "Money", "Opinion", "World", "Environment",
    "Media", "Science",
]


def _generate_mock_guardian(query: str, count: int) -> list[dict[str, Any]]:
    """Generate realistic mock Guardian articles."""
    items: list[dict[str, Any]] = []
    all_templates = _POSITIVE_GRD + _NEGATIVE_GRD * 2 + _NEUTRAL_GRD * 2

    for _ in range(count):
        template = random.choice(all_templates)
        headline = template.format(query=query.title())
        body = (
            f"{headline}. Writing in the Guardian, analysts noted that the {query} "
            f"situation represents a broader shift in how institutions are responding "
            f"to public expectations. The picture is more nuanced than either side "
            f"tends to acknowledge, one observer noted. As developments continue to "
            f"unfold, the implications for consumers and policymakers remain significant."
        )
        days_ago = random.randint(0, 60)
        date_str = (datetime.utcnow() - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")
        section = random.choice(_GRD_SECTIONS)
        slug = query.replace(" ", "-").lower()

        items.append({
            "source": "guardian",
            "content": body,
            "metadata": {
                "title": headline,
                "section": section,
                "author": random.choice(_GRD_AUTHORS),
                "date": date_str,
                "url": (
                    f"https://theguardian.com/{section.lower()}/"
                    f"{slug}-{random.randint(1000, 9999)}"
                ),
            },
        })

    return items


# ---------------------------------------------------------------------------
#  Scraper
# ---------------------------------------------------------------------------

_GUARDIAN_URL = "https://content.guardianapis.com/search"

# Bound pagination so one run cannot walk hundreds of result pages.
_MAX_PAGES = 10


class GuardianScraper(BaseScraper):
    """Fetches journalism from The Guardian via their Content API.

    Requires GUARDIAN_API_KEY. Free tier: 5,000 req/day, clean body text.
    Falls back to mock articles if the key is absent or the API fails.
    """

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(request_delay=0.5, **kwargs)
        self.logger = log.bind(scraper="GuardianScraper")

    def _get_api_key(self) -> str | None:
        try:
            from app.config import settings

            key = getattr(settings, "GUARDIAN_API_KEY", "")
            return key if key else None
        except Exception:  # noqa: BLE001
            return None

    async def _fetch_live(
        self, api_key: str, query: str, max_results: int
    ) -> list[dict[str, Any]]:
        """Fetch articles from The Guardian Content API."""
        results: list[dict[str, Any]] = []
        page = 1
        page_size = max(1, min(50, max_results))

        async with httpx.AsyncClient(timeout=15.0) as client:
            for _ in range(_MAX_PAGES):
                if len(results) >= max_results:
                    break

                params: dict[str, Any] = {
                    "q": query,
                    "api-key": api_key,
                    "show-fields": "bodyText,headline,byline",
                    "page-size": page_size,
                    "page": page,
                    "order-by": "relevance",
                }
                response = await client.get(_GUARDIAN_URL, params=params)
                response.raise_for_status()
                data = response.json()

                envelope = data.get("response") or {}
                api_results = envelope.get("results") or []
                if not api_results:
                    break

                for article in api_results:
                    fields = article.get("fields") or {}
                    body = (fields.get("bodyText") or "").strip()
                    headline = (
                        fields.get("headline") or article.get("webTitle") or ""
                    ).strip()
                    content = body if len(body) > 50 else headline
                    if not content:
                        continue

                    results.append({
                        "source": "guardian",
                        "content": content,
                        "metadata": {
                            "title": headline,
                            "section": article.get("sectionName", ""),
                            "author": fields.get("byline") or "Staff Reporter",
                            "date": article.get("webPublicationDate", ""),
                            "url": article.get("webUrl", ""),
                        },
                    })

                    if len(results) >= max_results:
                        break

                # Stop once the API says we are on the last page.
                total_pages = envelope.get("pages") or 1
                if page >= total_pages:
                    break
                page += 1

        return results

    async def _scrape_impl(self, query: str, max_results: int) -> list[dict[str, Any]]:
        api_key = self._get_api_key()

        if not api_key:
            self.logger.info("guardian_fallback_mock", reason="no_api_key")
            return _generate_mock_guardian(query, self._mock_count(max_results))

        try:
            results = await self._fetch_live(api_key, query, max_results)
            if results:
                self.logger.info("guardian_live_success", count=len(results))
                return results[:max_results]
            self.logger.info("guardian_fallback_mock", reason="no_results")
        except Exception as exc:  # noqa: BLE001
            self.logger.warning("guardian_api_failed", error=str(exc))

        return _generate_mock_guardian(query, self._mock_count(max_results))

    @staticmethod
    def _mock_count(max_results: int) -> int:
        return random.randint(10, max(10, min(20, max_results)))
