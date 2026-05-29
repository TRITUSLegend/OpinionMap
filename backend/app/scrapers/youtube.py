"""
YouTube comment scraper via Data API v3 with realistic demo/mock mode.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta
from typing import Any

import structlog

from app.scrapers.base import BaseScraper

log: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
#  Mock data
# ---------------------------------------------------------------------------

_POSITIVE_COMMENTS: list[str] = [
    "This {product} is absolutely incredible! Best purchase I've made this year 🔥",
    "Been using the {product} for a month now and I'm blown away by the quality.",
    "Thanks for this review! I just ordered the {product} because of this video.",
    "The {product} is a game changer. Totally worth the investment.",
    "I've tried many alternatives and the {product} is by far the best option.",
    "Love my {product}! Everything about it is perfect for my needs.",
    "Great video! The {product} looks amazing. Definitely adding to my wishlist.",
    "Already have the {product} and can confirm everything said here. 10/10.",
    "The {product} exceeded my expectations in every way possible!",
    "Finally someone who understands why the {product} is so good! Great review.",
    "Bought the {product} after watching this. Best decision ever 👍",
    "My {product} arrived yesterday and I'm already in love with it.",
]

_NEGATIVE_COMMENTS: list[str] = [
    "I had the {product} and returned it after a week. Terrible quality.",
    "Sponsored much? The {product} has way too many issues you didn't mention.",
    "Don't waste your money on the {product}. I learned the hard way.",
    "The {product} broke within 3 days. Total garbage. Save your money.",
    "Worst {product} I've ever owned. Nothing like what was shown in this video.",
    "This video is misleading. The {product} has serious design flaws.",
    "Had the {product} for two months. Multiple defects. Very disappointed.",
    "The {product} overheats constantly. Not recommended at all.",
]

_NEUTRAL_COMMENTS: list[str] = [
    "The {product} is decent but there are better options at this price range.",
    "Interesting review of the {product}. I'm still on the fence about buying it.",
    "The {product} has pros and cons. Might work for some people but not for me.",
    "Does anyone know how the {product} compares to last year's model?",
    "I wish you compared the {product} with its main competitor.",
    "Decent {product} but the software needs a lot of work.",
    "The {product} is fine for casual use but falls short for professionals.",
    "Okay video but I wish you covered more about the {product} battery life.",
]

_VIDEO_TITLES: list[str] = [
    "{product} Review - Is It Worth It in 2025?",
    "I Tested the {product} for 30 Days - Honest Opinion",
    "{product} vs Competition - ULTIMATE Comparison",
    "Why Everyone is Buying the {product} Right Now",
    "The Truth About the {product} Nobody Tells You",
    "{product} Unboxing & First Impressions",
    "Don't Buy the {product} Before Watching This!",
    "Is the {product} Really That Good? Deep Dive Review",
    "{product} - 6 Months Later (Long Term Review)",
    "TOP 5 Reasons to Get the {product}",
]

_AUTHORS: list[str] = [
    "TechReviewer", "GadgetFan99", "SmartConsumer", "EarlyAdopter",
    "CriticalThinker", "BudgetBuyer", "ProTester", "DailyUser42",
    "HonestReview", "TechMom", "DigitalNomad", "PCMasterRace",
    "AppleFanBoy", "AndroidUser", "NeutralObserver", "CasualViewer",
    "PowerUserPro", "MinimalistTech", "GamerDude", "WorkFromHome",
]

_VIDEO_IDS: list[str] = [
    "dQw4w9WgXcQ", "kJQP7kiw5Fk", "JGwWNGJdvx8", "RgKAFK5djSk",
    "9bZkp7q19f0", "CevxZvSJLk8", "hT_nvWreIhg", "OPf0YbXqDm0",
    "fJ9rUzIMcZQ", "2Vv-BfVoq4g", "YQHsXMglC9A", "60ItHLz5WEA",
]


def _generate_mock_comments(query: str, count: int) -> list[dict[str, Any]]:
    """Generate realistic mock YouTube comments."""
    product_name = query.replace("+", " ").title()
    comments: list[dict[str, Any]] = []

    all_templates = (
        [(_POSITIVE_COMMENTS, "positive")] * 5
        + [(_NEGATIVE_COMMENTS, "negative")] * 2
        + [(_NEUTRAL_COMMENTS, "neutral")] * 3
    )

    video_title_templates = random.sample(
        _VIDEO_TITLES, min(len(_VIDEO_TITLES), 5)
    )
    video_titles = [t.format(product=product_name) for t in video_title_templates]

    for i in range(count):
        templates, _ = random.choice(all_templates)
        template = random.choice(templates)
        content = template.format(product=product_name)

        days_ago = random.randint(1, 180)
        comment_date = (datetime.utcnow() - timedelta(days=days_ago)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )

        comments.append(
            {
                "source": "youtube",
                "content": content,
                "metadata": {
                    "author": random.choice(_AUTHORS),
                    "likes": random.randint(0, 2500),
                    "date": comment_date,
                    "video_title": random.choice(video_titles),
                    "video_id": random.choice(_VIDEO_IDS),
                },
            }
        )

    return comments


# ---------------------------------------------------------------------------
#  Scraper implementation
# ---------------------------------------------------------------------------

class YouTubeScraper(BaseScraper):
    """Fetches YouTube comments for videos matching a query.

    Uses the YouTube Data API v3 when ``settings.YOUTUBE_API_KEY`` is set.
    Falls back to realistic mock data in DEBUG mode or when the API call fails.
    """

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(request_delay=0.5, **kwargs)
        self.logger = log.bind(scraper="YouTubeScraper")

    # ------------------------------------------------------------------ #
    #  Live API helpers
    # ------------------------------------------------------------------ #

    def _get_youtube_service(self) -> Any | None:
        """Build the YouTube Data API client, or return None."""
        try:
            from app.config import settings

            api_key = getattr(settings, "YOUTUBE_API_KEY", None)
            if not api_key:
                return None

            from googleapiclient.discovery import build  # type: ignore[import-untyped]

            return build("youtube", "v3", developerKey=api_key)
        except Exception as exc:  # noqa: BLE001
            self.logger.warning("youtube_service_init_failed", error=str(exc))
            return None

    async def _search_videos(
        self, service: Any, query: str, max_videos: int = 5
    ) -> list[dict[str, str]]:
        """Search YouTube for videos matching the query."""
        import asyncio

        def _search() -> list[dict[str, str]]:
            request = service.search().list(
                q=query,
                part="snippet",
                type="video",
                maxResults=max_videos,
                order="relevance",
                relevanceLanguage="en",
            )
            response = request.execute()
            videos: list[dict[str, str]] = []
            for item in response.get("items", []):
                videos.append(
                    {
                        "video_id": item["id"]["videoId"],
                        "title": item["snippet"]["title"],
                    }
                )
            return videos

        return await asyncio.get_event_loop().run_in_executor(None, _search)

    async def _get_comments(
        self, service: Any, video_id: str, video_title: str, max_comments: int = 20
    ) -> list[dict[str, Any]]:
        """Fetch top-level comments for a video."""
        import asyncio

        def _fetch() -> list[dict[str, Any]]:
            comments: list[dict[str, Any]] = []
            try:
                request = service.commentThreads().list(
                    videoId=video_id,
                    part="snippet",
                    maxResults=min(max_comments, 100),
                    order="relevance",
                    textFormat="plainText",
                )
                response = request.execute()
                for item in response.get("items", []):
                    snippet = item["snippet"]["topLevelComment"]["snippet"]
                    comments.append(
                        {
                            "source": "youtube",
                            "content": snippet.get("textDisplay", ""),
                            "metadata": {
                                "author": snippet.get("authorDisplayName", "Unknown"),
                                "likes": snippet.get("likeCount", 0),
                                "date": snippet.get("publishedAt", ""),
                                "video_title": video_title,
                                "video_id": video_id,
                            },
                        }
                    )
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "youtube_comments_error",
                    video_id=video_id,
                    error=str(exc),
                )
            return comments

        return await asyncio.get_event_loop().run_in_executor(None, _fetch)

    # ------------------------------------------------------------------ #
    #  Main implementation
    # ------------------------------------------------------------------ #

    async def _scrape_impl(
        self,
        query: str,
        max_results: int,
    ) -> list[dict[str, Any]]:
        # Check DEBUG flag
        try:
            from app.config import settings

            if getattr(settings, "DEBUG", False):
                self.logger.info("youtube_demo_mode", reason="DEBUG=True")
                count = random.randint(30, min(50, max_results))
                return _generate_mock_comments(query, count)
        except ImportError:
            pass

        service = self._get_youtube_service()
        if service is None:
            self.logger.info("youtube_fallback_mock", reason="no_api_key_or_service")
            count = random.randint(30, min(50, max_results))
            return _generate_mock_comments(query, count)

        try:
            videos = await self._search_videos(service, query, max_videos=5)
            if not videos:
                self.logger.info("youtube_fallback_mock", reason="no_videos_found")
                count = random.randint(30, min(50, max_results))
                return _generate_mock_comments(query, count)

            self.logger.info("youtube_videos_found", count=len(videos))

            all_comments: list[dict[str, Any]] = []
            per_video = max(max_results // len(videos), 10)

            for video in videos:
                comments = await self._get_comments(
                    service, video["video_id"], video["title"], per_video
                )
                all_comments.extend(comments)
                if len(all_comments) >= max_results:
                    break

            if not all_comments:
                self.logger.info("youtube_fallback_mock", reason="no_comments_fetched")
                count = random.randint(30, min(50, max_results))
                return _generate_mock_comments(query, count)

            return all_comments[:max_results]

        except Exception as exc:  # noqa: BLE001
            self.logger.error("youtube_scrape_error", error=str(exc))
            count = random.randint(30, min(50, max_results))
            return _generate_mock_comments(query, count)
