"""
Bluesky scraper via the AT Protocol API.

Most AT Protocol read endpoints are open on https://public.api.bsky.app/xrpc/,
but app.bsky.feed.searchPosts is NOT: as of 2026-08 the public appview returns
403 for unauthenticated search (verified -- app.bsky.actor.getProfile still
returns 200 on the same host, so this is endpoint-specific, not a UA block).

So live search requires credentials:
    BLUESKY_IDENTIFIER    -- your handle, e.g. yourname.bsky.social
    BLUESKY_APP_PASSWORD  -- an app password from Settings > App Passwords
                             (never your real account password)

Without credentials the scraper still probes the public endpoint (in case the
restriction is lifted) and otherwise falls back to realistic mock data.
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
#  Mock data -- Bluesky / ex-Twitter casual tech commentary
# ---------------------------------------------------------------------------

_POSITIVE_BSK: list[str] = [
    "genuinely loving {query} rn, does exactly what it promises",
    "okay {query} actually slaps. didn't expect to be this impressed",
    "the {query} team shipped something real today. massive respect.",
    "{query} is quietly becoming my favourite tool in the stack. underrated.",
    "been using {query} for a week and my whole workflow has changed",
    "hot take: {query} is actually good and people aren't talking about it enough",
    "just switched to {query} and i don't know why i waited so long",
    "{query} just saved me 3 hours of work. genuinely grateful",
]

_NEGATIVE_BSK: list[str] = [
    "why is {query} so painful to set up? docs are a mess.",
    "{query} keeps crashing on my setup. really frustrating experience.",
    "not impressed with {query}. the hype is way ahead of the actual product.",
    "cancelled my {query} subscription. just not worth it at this price.",
    "the {query} onboarding is genuinely costing them users. needs a rethink.",
    "i wanted to love {query} but it is just not there yet",
    "{query} had so much potential but the execution is disappointing",
    "every release of {query} introduces more bugs than it fixes. pass.",
]

_NEUTRAL_BSK: list[str] = [
    "anyone here tried {query}? genuinely curious what the community thinks",
    "just started looking at {query}. too early to have a strong opinion",
    "{query} is interesting but i'm not sure it fits my specific use case",
    "watching the {query} space closely. lots of movement lately",
    "hot take: {query} is fine. not revolutionary, not a disaster",
    "curious where {query} is in 12 months. the trajectory is hard to read",
    "can someone explain why {query} is trending? genuinely asking",
    "the {query} debate continues. both sides have valid points tbh",
]

_BSK_AUTHORS: list[str] = [
    "dev.bsky.social", "indie.builder.bsky.social", "techskeptic.bsky.social",
    "opensourcefan.bsky.social", "uxdesigner.bsky.social", "sre.bsky.social",
    "productmanager.bsky.social", "airesearcher.bsky.social", "webdev.bsky.social",
    "datacruncher.bsky.social", "cloudnative.bsky.social", "rustacean.bsky.social",
]


def _generate_mock_bluesky(query: str, count: int) -> list[dict[str, Any]]:
    """Generate realistic mock Bluesky posts."""
    items: list[dict[str, Any]] = []
    all_templates = _POSITIVE_BSK * 2 + _NEGATIVE_BSK + _NEUTRAL_BSK * 2

    for _ in range(count):
        template = random.choice(all_templates)
        content = template.format(query=query)
        hours_ago = random.randint(1, 72 * 24)
        date_str = (datetime.utcnow() - timedelta(hours=hours_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")
        handle = random.choice(_BSK_AUTHORS)
        post_id = "".join(random.choice("abcdefghijklmnopqrstuvwxyz234567") for _ in range(13))

        items.append({
            "source": "bluesky",
            "content": content,
            "metadata": {
                "author": handle,
                "display_name": handle.split(".")[0].title(),
                "date": date_str,
                "likes": random.randint(0, 500),
                "reposts": random.randint(0, 100),
                "replies": random.randint(0, 50),
                "url": f"https://bsky.app/profile/{handle}/post/{post_id}",
            },
        })

    return items


# ---------------------------------------------------------------------------
#  Scraper
# ---------------------------------------------------------------------------

_PUBLIC_API = "https://public.api.bsky.app/xrpc"
_AUTH_API = "https://bsky.social/xrpc"

# Safety valve so a misbehaving cursor can never spin the pagination loop forever.
_MAX_PAGES = 10


class BlueskyScraper(BaseScraper):
    """Fetches Bluesky posts via the AT Protocol searchPosts endpoint.

    Uses an authenticated session when BLUESKY_IDENTIFIER and
    BLUESKY_APP_PASSWORD are configured, since the public appview now rejects
    unauthenticated search. Falls back to realistic mock data otherwise.
    """

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(request_delay=0.5, **kwargs)
        self.logger = log.bind(scraper="BlueskyScraper")

    def _get_credentials(self) -> tuple[str, str] | None:
        try:
            from app.config import settings

            identifier = getattr(settings, "BLUESKY_IDENTIFIER", "")
            password = getattr(settings, "BLUESKY_APP_PASSWORD", "")
            return (identifier, password) if identifier and password else None
        except Exception:  # noqa: BLE001
            return None

    async def _create_session(
        self, client: httpx.AsyncClient, identifier: str, password: str
    ) -> str | None:
        """Exchange an app password for a short-lived access JWT."""
        try:
            response = await client.post(
                f"{_AUTH_API}/com.atproto.server.createSession",
                json={"identifier": identifier, "password": password},
            )
            response.raise_for_status()
            token = response.json().get("accessJwt")
            if token:
                self.logger.info("bluesky_session_created", identifier=identifier)
            return token
        except Exception as exc:  # noqa: BLE001
            self.logger.warning("bluesky_session_failed", error=str(exc))
            return None

    async def _fetch_live(self, query: str, max_results: int) -> list[dict[str, Any]]:
        """Search Bluesky posts, authenticating when credentials are available."""
        results: list[dict[str, Any]] = []
        cursor: str | None = None
        seen_cursors: set[str] = set()
        page_limit = max(1, min(100, max_results))

        async with httpx.AsyncClient(timeout=10.0) as client:
            base = _PUBLIC_API
            headers: dict[str, str] = {}

            creds = self._get_credentials()
            if creds:
                token = await self._create_session(client, *creds)
                if token:
                    base = _AUTH_API
                    headers["Authorization"] = f"Bearer {token}"
            else:
                self.logger.info(
                    "bluesky_unauthenticated",
                    note="searchPosts usually returns 403 without credentials",
                )

            for _ in range(_MAX_PAGES):
                if len(results) >= max_results:
                    break

                params: dict[str, Any] = {"q": query, "limit": page_limit}
                if cursor:
                    params["cursor"] = cursor

                response = await client.get(
                    f"{base}/app.bsky.feed.searchPosts",
                    params=params,
                    headers=headers,
                )
                response.raise_for_status()
                data = response.json()

                posts = data.get("posts", [])
                if not posts:
                    break

                for post in posts:
                    record = post.get("record") or {}
                    text = (record.get("text") or "").strip()
                    if not text or len(text) < 5:
                        continue

                    author = post.get("author") or {}
                    handle = author.get("handle", "unknown")
                    rkey = (post.get("uri") or "").split("/")[-1]

                    results.append({
                        "source": "bluesky",
                        "content": text,
                        "metadata": {
                            "author": handle,
                            "display_name": author.get("displayName", ""),
                            "date": record.get("createdAt", ""),
                            "likes": post.get("likeCount", 0),
                            "reposts": post.get("repostCount", 0),
                            "replies": post.get("replyCount", 0),
                            "url": f"https://bsky.app/profile/{handle}/post/{rkey}",
                        },
                    })

                    if len(results) >= max_results:
                        break

                cursor = data.get("cursor")
                if not cursor or cursor in seen_cursors:
                    break
                seen_cursors.add(cursor)

        return results

    async def _scrape_impl(self, query: str, max_results: int) -> list[dict[str, Any]]:
        try:
            results = await self._fetch_live(query, max_results)
            if results:
                self.logger.info("bluesky_live_success", count=len(results))
                return results[:max_results]
            self.logger.info("bluesky_fallback_mock", reason="no_results")
        except Exception as exc:  # noqa: BLE001
            self.logger.warning("bluesky_api_failed", error=str(exc))

        count = random.randint(20, max(20, min(40, max_results)))
        return _generate_mock_bluesky(query, count)
