"""
Reddit scraper using PRAW with realistic demo/mock mode.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta
from typing import Any

import structlog

from app.scrapers.base import BaseScraper

log: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
#  Default subreddits to search when no product-specific sub is obvious
# ---------------------------------------------------------------------------
_DEFAULT_SUBREDDITS: list[str] = [
    "technology", "gadgets", "BuyItForLife", "productreviews",
    "hardware", "consumerelectronics", "techdeals",
]

# ---------------------------------------------------------------------------
#  Mock data
# ---------------------------------------------------------------------------

_POSITIVE_POSTS: list[str] = [
    "Just got the {product} and it's amazing! Highly recommend to anyone considering it.",
    "PSA: The {product} is on sale right now and it's 100% worth the full price, let alone discounted.",
    "My {product} review after 6 months of daily use - still going strong!",
    "Switched from the competitor to {product} and the difference is night and day.",
    "Can we talk about how underrated the {product} is? Seriously one of the best in its category.",
    "Finally pulled the trigger on the {product}. Why did I wait so long?",
    "The {product} community doesn't talk enough about how good the build quality is.",
    "Three months in with my {product} - here are my detailed impressions (spoiler: it's great).",
    "If you're on the fence about the {product}, just buy it. You won't regret it.",
    "The {product} is hands down the best purchase I've made this year. Fight me.",
]

_NEGATIVE_POSTS: list[str] = [
    "Warning: My {product} died after only 2 months of use. Quality control seems terrible.",
    "Am I the only one having issues with the {product}? Multiple defects out of the box.",
    "Returned my {product} today. It's nowhere near as good as the marketing suggests.",
    "The {product} has a serious overheating problem that nobody is talking about.",
    "Buyer beware: The {product} customer support is absolutely terrible. Here's my experience.",
    "Hot take: The {product} is the most overrated product of the year. Here's why.",
    "Don't buy the {product} - there's a known firmware issue causing data loss.",
    "My {product} started making a clicking noise after 3 weeks. Anyone else?",
]

_NEUTRAL_POSTS: list[str] = [
    "Looking for opinions: {product} vs alternatives? Can't decide.",
    "Honest question - is the {product} worth the price or should I wait for next gen?",
    "The {product} is a solid B-tier option. Here's my balanced review with pros and cons.",
    "For those asking about the {product}: it's fine for most people. Not amazing, not terrible.",
    "Comparing {product} with its main competitor - they're surprisingly similar.",
    "Quick question about the {product}: does anyone know if the new version fixed the old issues?",
    "Got the {product} for a reasonable price. AMA about my experience so far.",
    "The {product} does what it says. Nothing more, nothing less. Mid-range at its finest.",
]

_REPLY_TEMPLATES: list[str] = [
    "I agree with this. The {product} is exactly as you described.",
    "Had a completely different experience with the {product}. Mine works flawlessly.",
    "This is spot on. I've been saying the same thing about the {product} for months.",
    "Can confirm. The {product} is solid but not without its quirks.",
    "Depends on the use case. For my workflow, the {product} is perfect.",
    "I returned mine too. The {product} just wasn't for me.",
    "Interesting perspective. I'll keep this in mind when my {product} arrives.",
    "The {product} community is really helpful. Thanks for sharing your experience!",
    "As a long-time {product} user, I can say the quality has gone downhill recently.",
    "Just ordered the {product} based on this thread. Fingers crossed!",
]

_SUBREDDITS: list[str] = [
    "technology", "gadgets", "BuyItForLife", "productreviews",
    "AskTechnology", "hardware", "TechSupport", "deals",
    "SuggestAProduct", "ProductTesting",
]

_AUTHORS: list[str] = [
    "tech_enthusiast_42", "honest_reviewer", "budget_conscious",
    "daily_driver_user", "early_adopter_99", "critical_eye_2024",
    "power_user_pro", "casual_consumer", "gadget_guru_x",
    "minimalist_buyer", "quality_matters", "return_specialist",
    "first_timer", "long_term_user", "skeptic_shopper",
    "deal_hunter", "pro_tester", "avg_joe_tech",
    "smart_money", "weekend_warrior",
]


def _generate_mock_data(query: str, count: int) -> list[dict[str, Any]]:
    """Generate realistic mock Reddit posts and comments."""
    product_name = query.replace("+", " ").title()
    items: list[dict[str, Any]] = []

    all_templates = (
        _POSITIVE_POSTS * 2
        + _NEGATIVE_POSTS
        + _NEUTRAL_POSTS
        + _REPLY_TEMPLATES * 2
    )

    for i in range(count):
        template = random.choice(all_templates)
        content = template.format(product=product_name)

        days_ago = random.randint(1, 365)
        post_date = (datetime.utcnow() - timedelta(days=days_ago)).strftime("%Y-%m-%d")

        is_post = random.random() > 0.4  # 60% posts, 40% comments

        items.append(
            {
                "source": "reddit",
                "content": content,
                "metadata": {
                    "subreddit": random.choice(_SUBREDDITS),
                    "score": random.randint(-5, 5000),
                    "author": random.choice(_AUTHORS),
                    "date": post_date,
                    "post_title": (
                        template.format(product=product_name)[:80]
                        if is_post
                        else f"Re: {product_name} discussion"
                    ),
                    "num_comments": random.randint(0, 500) if is_post else 0,
                    "type": "post" if is_post else "comment",
                },
            }
        )

    return items


# ---------------------------------------------------------------------------
#  Scraper implementation
# ---------------------------------------------------------------------------

class RedditScraper(BaseScraper):
    """Scrapes Reddit posts and comments using PRAW.

    Falls back to realistic mock data when ``settings.DEBUG`` is ``True``,
    when PRAW credentials are missing, or when live access fails.
    """

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(request_delay=1.5, **kwargs)
        self.logger = log.bind(scraper="RedditScraper")

    # ------------------------------------------------------------------ #
    #  PRAW client helper
    # ------------------------------------------------------------------ #

    def _get_reddit_client(self) -> Any | None:
        """Build a PRAW Reddit instance or return None."""
        try:
            from app.config import settings

            client_id = getattr(settings, "REDDIT_CLIENT_ID", None)
            client_secret = getattr(settings, "REDDIT_CLIENT_SECRET", None)
            user_agent = getattr(
                settings,
                "REDDIT_USER_AGENT",
                "AgentFlow:v1.0 (by /u/agentflow_bot)",
            )
            if not client_id or not client_secret:
                return None

            import praw  # type: ignore[import-untyped]

            return praw.Reddit(
                client_id=client_id,
                client_secret=client_secret,
                user_agent=user_agent,
            )
        except Exception as exc:  # noqa: BLE001
            self.logger.warning("reddit_client_init_failed", error=str(exc))
            return None

    # ------------------------------------------------------------------ #
    #  Live scraping
    # ------------------------------------------------------------------ #

    async def _search_subreddits(
        self,
        reddit: Any,
        query: str,
        max_results: int,
    ) -> list[dict[str, Any]]:
        """Search Reddit and collect posts + top comments."""
        import asyncio

        def _search() -> list[dict[str, Any]]:
            results: list[dict[str, Any]] = []

            # Search across relevant subreddits
            subreddits_to_search = _DEFAULT_SUBREDDITS + [
                query.replace(" ", "").lower()
            ]

            for sub_name in subreddits_to_search:
                try:
                    subreddit = reddit.subreddit(sub_name)
                    for submission in subreddit.search(
                        query, sort="relevance", time_filter="year", limit=10
                    ):
                        # Add the post itself
                        results.append(
                            {
                                "source": "reddit",
                                "content": (
                                    f"{submission.title}\n\n{submission.selftext}"
                                    if submission.selftext
                                    else submission.title
                                ),
                                "metadata": {
                                    "subreddit": sub_name,
                                    "score": submission.score,
                                    "author": str(submission.author) if submission.author else "[deleted]",
                                    "date": datetime.utcfromtimestamp(
                                        submission.created_utc
                                    ).strftime("%Y-%m-%d"),
                                    "post_title": submission.title,
                                    "num_comments": submission.num_comments,
                                    "type": "post",
                                },
                            }
                        )

                        # Fetch top comments
                        submission.comment_sort = "best"
                        submission.comments.replace_more(limit=0)
                        for comment in submission.comments[:5]:
                            if hasattr(comment, "body") and len(comment.body) > 10:
                                results.append(
                                    {
                                        "source": "reddit",
                                        "content": comment.body,
                                        "metadata": {
                                            "subreddit": sub_name,
                                            "score": comment.score,
                                            "author": str(comment.author) if comment.author else "[deleted]",
                                            "date": datetime.utcfromtimestamp(
                                                comment.created_utc
                                            ).strftime("%Y-%m-%d"),
                                            "post_title": submission.title,
                                            "num_comments": 0,
                                            "type": "comment",
                                        },
                                    }
                                )

                        if len(results) >= max_results:
                            break

                except Exception as exc:  # noqa: BLE001
                    log.warning(
                        "reddit_subreddit_error",
                        subreddit=sub_name,
                        error=str(exc),
                    )
                    continue

                if len(results) >= max_results:
                    break

            return results[:max_results]

        return await asyncio.get_event_loop().run_in_executor(None, _search)

    async def _scrape_public_json(self, query: str, max_results: int) -> list[dict[str, Any]]:
        """Scrape Reddit public JSON search endpoint as a keyless fallback."""
        import httpx
        from urllib.parse import quote
        
        try:
            url = f"https://www.reddit.com/search.json?q={quote(query)}&limit={max_results}&sort=relevance&t=year"
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
            
            async with httpx.AsyncClient(headers=headers, timeout=10.0) as client:
                response = await client.get(url)
                if response.status_code != 200:
                    self.logger.warning("reddit_public_json_http_error", status_code=response.status_code)
                    return []
                    
                data = response.json()
                children = data.get("data", {}).get("children", [])
                
                results = []
                for child in children:
                    post = child.get("data", {})
                    if not post:
                        continue
                        
                    title = post.get("title", "")
                    selftext = post.get("selftext", "")
                    content = f"{title}\n\n{selftext}" if selftext else title
                    
                    created_utc = post.get("created_utc", 0)
                    date_str = datetime.utcfromtimestamp(created_utc).strftime("%Y-%m-%d") if created_utc else datetime.utcnow().strftime("%Y-%m-%d")
                    
                    results.append({
                        "source": "reddit",
                        "content": content,
                        "metadata": {
                            "subreddit": post.get("subreddit", "unknown"),
                            "score": post.get("score", 0),
                            "author": post.get("author", "[deleted]"),
                            "date": date_str,
                            "post_title": title,
                            "num_comments": post.get("num_comments", 0),
                            "type": "post"
                        }
                    })
                
                self.logger.info("reddit_public_json_success", count=len(results))
                return results
        except Exception as exc:
            self.logger.warning("reddit_public_json_failed", error=str(exc))
            return []

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
                self.logger.info("reddit_demo_mode", reason="DEBUG=True")
                # Try fetching live public data even in debug mode if possible!
                public_results = await self._scrape_public_json(query, max_results)
                if public_results:
                    return public_results
                count = random.randint(30, min(50, max_results))
                return _generate_mock_data(query, count)
        except ImportError:
            pass

        reddit = self._get_reddit_client()
        if reddit is None:
            self.logger.info("reddit_fallback_public_json", reason="no_credentials")
            public_results = await self._scrape_public_json(query, max_results)
            if public_results:
                return public_results
                
            self.logger.info("reddit_fallback_mock", reason="no_credentials_and_public_failed")
            count = random.randint(30, min(50, max_results))
            return _generate_mock_data(query, count)

        try:
            results = await self._search_subreddits(reddit, query, max_results)
            if not results:
                self.logger.info("reddit_fallback_public_json", reason="no_praw_results")
                public_results = await self._scrape_public_json(query, max_results)
                if public_results:
                    return public_results
                    
                self.logger.info("reddit_fallback_mock", reason="no_praw_results_and_public_failed")
                count = random.randint(30, min(50, max_results))
                return _generate_mock_data(query, count)

            self.logger.info("reddit_results_collected", count=len(results))
            return results

        except Exception as exc:  # noqa: BLE001
            self.logger.error("reddit_scrape_error", error=str(exc))
            public_results = await self._scrape_public_json(query, max_results)
            if public_results:
                return public_results
                
            count = random.randint(30, min(50, max_results))
            return _generate_mock_data(query, count)
