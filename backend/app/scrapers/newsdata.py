"""
NewsData.io scraper -- real-time news articles from 70,000+ global sources.

Free tier: 200 requests/day, full article text included.
Sign up for a free API key at: https://newsdata.io

Set NEWSDATA_API_KEY in your .env to enable live mode.
Falls back to realistic mock headlines when the key is absent or the API fails.
"""

from __future__ import annotations

import random
import re
from datetime import datetime, timedelta
from typing import Any

import httpx
import structlog

from app.scrapers.base import BaseScraper

log: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
#  Mock data -- news headline style
# ---------------------------------------------------------------------------

_POSITIVE_NEWS: list[str] = [
    "{query} Reports Record Growth as Market Share Continues to Expand",
    "Analysts Turn Bullish on {query}: Strong Fundamentals Drive Optimism",
    "{query} Wins Prestigious Industry Award for Innovation in 2025",
    "Consumer Satisfaction Survey Places {query} at the Top of Its Category",
    "{query} Announces Major Partnership That Could Reshape the Industry",
    "Investors Cheer as {query} Beats Earnings Expectations for Third Straight Quarter",
    "{query} Expands Into New Markets With Strong Early Demand",
]

_NEGATIVE_NEWS: list[str] = [
    "{query} Faces Growing Backlash Over Controversial Product Decision",
    "Regulator Opens Investigation Into {query} Over Compliance Concerns",
    "{query} Shares Tumble After Missing Quarterly Revenue Targets",
    "Former Employees Raise Concerns About Culture and Leadership at {query}",
    "{query} Hit With Class Action Lawsuit Over Alleged Consumer Harm",
    "Critics Slam the {query} Response to Mounting Customer Complaints",
    "Watchdog Group Calls {query} Practices Deceptive and Harmful",
]

_NEUTRAL_NEWS: list[str] = [
    "{query} Releases Q3 Results: A Mixed Picture Across Segments",
    "What the Latest {query} Strategic Announcement Means for the Market",
    "{query} Enters Adjacent Market: Analysts Divided on Prospects",
    "Expert Roundup: Where Does {query} Stand in Today's Landscape?",
    "{query} Leadership Change Prompts Questions About Future Direction",
    "Deep Dive: The {query} Business Model, Explained",
    "{query} at a Crossroads: Opportunities and Risks Ahead",
]

_NEWS_SOURCES: list[str] = [
    "TechCrunch", "Reuters", "Bloomberg", "The Verge", "CNBC",
    "Forbes", "Wired", "VentureBeat", "Business Insider", "Ars Technica",
    "The Information", "Axios", "Protocol", "Fast Company", "MIT Tech Review",
]


def _strip_html(text: str) -> str:
    """Remove HTML tags from text."""
    return re.sub(r"<[^>]+>", " ", text).strip()


def _generate_mock_news(query: str, count: int) -> list[dict[str, Any]]:
    """Generate realistic mock news articles."""
    items: list[dict[str, Any]] = []
    all_templates = _POSITIVE_NEWS * 2 + _NEGATIVE_NEWS + _NEUTRAL_NEWS * 2

    for _ in range(count):
        template = random.choice(all_templates)
        headline = template.format(query=query.title())
        body = (
            f"{headline}. Industry observers noted that this development comes amid "
            f"growing interest in the {query} space. Stakeholders are watching closely "
            f"as the situation continues to evolve."
        )
        days_ago = random.randint(0, 30)
        date_str = (datetime.utcnow() - timedelta(days=days_ago)).strftime("%Y-%m-%d %H:%M:%S")
        slug = query.replace(" ", "-").lower()

        items.append({
            "source": "news",
            "content": body,
            "metadata": {
                "title": headline,
                "source_name": random.choice(_NEWS_SOURCES),
                "author": "Staff Reporter",
                "date": date_str,
                "url": f"https://example.com/news/{slug}-{random.randint(1000, 9999)}",
            },
        })

    return items


# ---------------------------------------------------------------------------
#  Scraper
# ---------------------------------------------------------------------------

_NEWSDATA_URL = "https://newsdata.io/api/1/news"

# Free tier allows 200 requests/day -- cap pagination so one workflow run
# cannot burn through the daily quota.
_MAX_PAGES = 5


class NewsdataScraper(BaseScraper):
    """Fetches real-time news articles via NewsData.io.

    Requires NEWSDATA_API_KEY in environment. Free tier gives 200 requests/day
    with full article text. Falls back to mock headlines if the key is absent
    or the API fails.
    """

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(request_delay=1.0, **kwargs)
        self.logger = log.bind(scraper="NewsdataScraper")

    def _get_api_key(self) -> str | None:
        try:
            from app.config import settings

            key = getattr(settings, "NEWSDATA_API_KEY", "")
            return key if key else None
        except Exception:  # noqa: BLE001
            return None

    async def _fetch_live(
        self, api_key: str, query: str, max_results: int
    ) -> list[dict[str, Any]]:
        """Fetch articles from the NewsData.io API."""
        results: list[dict[str, Any]] = []
        next_page: str | None = None
        seen_pages: set[str] = set()
        page_size = max(1, min(10, max_results))  # free tier max per request

        async with httpx.AsyncClient(timeout=15.0) as client:
            for _ in range(_MAX_PAGES):
                if len(results) >= max_results:
                    break

                params: dict[str, Any] = {
                    "apikey": api_key,
                    "q": query,
                    "language": "en",
                    "size": page_size,
                }
                if next_page:
                    params["page"] = next_page

                response = await client.get(_NEWSDATA_URL, params=params)
                response.raise_for_status()
                data = response.json()

                if data.get("status") != "success":
                    self.logger.warning("newsdata_api_error", response=data)
                    break

                articles = data.get("results") or []
                if not articles:
                    break

                for article in articles:
                    # Use full content if available, else description, else title
                    content = (
                        _strip_html(article.get("content") or "")
                        or _strip_html(article.get("description") or "")
                        or (article.get("title") or "")
                    ).strip()

                    if not content or len(content) < 20:
                        continue

                    creators = article.get("creator") or []
                    author = creators[0] if creators else "Staff Reporter"

                    results.append({
                        "source": "news",
                        "content": content,
                        "metadata": {
                            "title": article.get("title", ""),
                            "source_name": article.get("source_name", "Unknown"),
                            "author": author,
                            "date": article.get("pubDate", ""),
                            "url": article.get("link", ""),
                        },
                    })

                    if len(results) >= max_results:
                        break

                next_page = data.get("nextPage")
                if not next_page or next_page in seen_pages:
                    break
                seen_pages.add(next_page)

        return results

    async def _scrape_impl(self, query: str, max_results: int) -> list[dict[str, Any]]:
        api_key = self._get_api_key()

        if not api_key:
            self.logger.info("newsdata_fallback_mock", reason="no_api_key")
            return _generate_mock_news(query, self._mock_count(max_results))

        try:
            results = await self._fetch_live(api_key, query, max_results)
            if results:
                self.logger.info("newsdata_live_success", count=len(results))
                return results[:max_results]
            self.logger.info("newsdata_fallback_mock", reason="no_results")
        except Exception as exc:  # noqa: BLE001
            self.logger.warning("newsdata_api_failed", error=str(exc))

        return _generate_mock_news(query, self._mock_count(max_results))

    @staticmethod
    def _mock_count(max_results: int) -> int:
        return random.randint(15, max(15, min(25, max_results)))
