"""
Twitter/X sentiment scraper with realistic mock mode.
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
    """Scrapes Twitter/X results. Currently uses mock data for reliable testing."""
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
