"""
Twitter/X sentiment source -- SIMULATED DATA, NOT A LIVE SCRAPER.

This module does NOT call the Twitter/X API. X's API requires paid access, so this
module generates realistic synthetic sentiment data instead, keeping the multi-source
research pipeline demoable end-to-end without a paid API key.

Every record it returns is machine-generated from the sentence templates below. Treat
its output as illustrative sample data, never as real observed public opinion.

Note the contrast with the other two sources: ``app.scrapers.reddit`` and
``app.scrapers.youtube`` DO have real live code paths (PRAW and the YouTube Data
API v3) and only fall back to generated data when credentials are missing/rejected
or ``DEBUG`` is true. This module has no live path at all -- it is always synthetic.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta
from typing import Any

import structlog

from app.scrapers.base import BaseScraper

log: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

_POSITIVE_TEMPLATES: list[str] = [
    "Just read about {query} and I'm genuinely impressed! Great developments.",
    "People are sleeping on {query}. It's actually game-changing if you look closely.",
    "Huge fan of what's happening with {query}. Exactly what we needed right now \U0001f44f",
    "Can we talk about {query}? Absolutely brilliant execution and solid progress.",
    "I was skeptical about {query} at first, but now I'm completely sold.",
    "Finally some good news regarding {query}. Love to see it!",
]

_NEGATIVE_TEMPLATES: list[str] = [
    "Honestly, {query} is a complete disaster. Who thought this was a good idea?",
    "I'm so tired of hearing about {query}. It's overrated and failing to deliver.",
    "This whole situation with {query} keeps getting worse by the minute \U0001f926\u200d\u2642\ufe0f",
    "Big letdown from {query} today. Expected way better.",
    "Why does everyone pretend {query} is fine? It's clearly a massive problem.",
    "The handling of {query} has been incredibly poor. Not looking good.",
]

_NEUTRAL_TEMPLATES: list[str] = [
    "Interesting to see the latest updates on {query}. Wonder how it plays out.",
    "Just catching up on {query}. There's a lot of mixed opinions out there.",
    "Not sure how I feel about {query} yet. Need to see more data.",
    "The discourse around {query} today is wild. Taking it all with a grain of salt.",
    "Looks like {query} is trending again. Here we go.",
]

def _generate_mock_tweets(query: str, count: int) -> list[dict[str, Any]]:
    """Build ``count`` synthetic tweets about ``query``. No network access involved."""
    tweets: list[dict[str, Any]] = []
    
    sentiments: list[tuple[list[str], float, float]] = [
        (_POSITIVE_TEMPLATES, 0.7, 1.0),
        (_POSITIVE_TEMPLATES, 0.7, 1.0),
        (_NEGATIVE_TEMPLATES, 0.0, 0.3),
        (_NEUTRAL_TEMPLATES, 0.4, 0.6),
    ]

    for i in range(count):
        templates, _, _ = sentiments[i % len(sentiments)]
        template = random.choice(templates)
        content = template.format(query=query)

        days_ago = random.randint(0, 7)
        tweet_date = (datetime.utcnow() - timedelta(days=days_ago)).strftime("%Y-%m-%d")
        
        likes = random.randint(0, 10000)
        retweets = random.randint(0, 2000)

        tweets.append(
            {
                "source": "twitter",
                "content": content,
                "metadata": {
                    "likes": likes,
                    "retweets": retweets,
                    "date": tweet_date,
                    "author": f"User{random.randint(1000, 9999)}",
                },
            }
        )

    return tweets

class TwitterScraper(BaseScraper):
    """Simulated Twitter/X source.

    Despite the ``Scraper`` name (kept so it stays interchangeable with the real
    :class:`~app.scrapers.reddit.RedditScraper` and
    :class:`~app.scrapers.youtube.YouTubeScraper`), this class performs no network
    calls. :meth:`_scrape_impl` returns synthetic tweets -- see the module docstring.
    """
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(request_delay=1.0, **kwargs)
        self.logger = log.bind(scraper="TwitterScraper")

    async def _scrape_impl(
        self,
        query: str,
        max_results: int,
    ) -> list[dict[str, Any]]:
        
        self.logger.info("twitter_demo_mode", reason="using_mock_data")
        count = random.randint(30, min(50, max_results))
        return _generate_mock_tweets(query, count)
