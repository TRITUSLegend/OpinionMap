"""
Base scraper with retry logic, rate limiting, and structured logging.
"""

from __future__ import annotations

import abc
import asyncio
import time
from typing import Any

import structlog

log: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)


class BaseScraper(abc.ABC):
    """Abstract base class for all data scrapers.

    Features:
        * Built-in exponential-backoff retry (configurable ``max_retries``).
        * Per-request rate-limiting via ``request_delay`` (seconds).
        * Consistent structured logging for every scraping attempt.
    """

    def __init__(
        self,
        *,
        max_retries: int = 3,
        request_delay: float = 1.0,
        backoff_factor: float = 2.0,
    ) -> None:
        self.max_retries = max_retries
        self.request_delay = request_delay
        self.backoff_factor = backoff_factor
        self._last_request_time: float = 0.0
        self.logger = log.bind(scraper=self.__class__.__name__)

    # ------------------------------------------------------------------ #
    #  Rate limiter
    # ------------------------------------------------------------------ #
    async def _rate_limit(self) -> None:
        """Enforce minimum delay between consecutive requests."""
        now = time.monotonic()
        elapsed = now - self._last_request_time
        if elapsed < self.request_delay:
            wait = self.request_delay - elapsed
            self.logger.debug("rate_limit_wait", wait_seconds=round(wait, 3))
            await asyncio.sleep(wait)
        self._last_request_time = time.monotonic()

    # ------------------------------------------------------------------ #
    #  Retry wrapper
    # ------------------------------------------------------------------ #
    async def _execute_with_retry(
        self,
        query: str,
        max_results: int,
    ) -> list[dict[str, Any]]:
        """Execute :py:meth:`_scrape_impl` with exponential-backoff retries."""
        last_exc: Exception | None = None

        for attempt in range(1, self.max_retries + 1):
            try:
                self.logger.info(
                    "scrape_attempt",
                    attempt=attempt,
                    query=query,
                    max_results=max_results,
                )
                await self._rate_limit()
                results = await self._scrape_impl(query, max_results)
                self.logger.info(
                    "scrape_success",
                    attempt=attempt,
                    results_count=len(results),
                )
                return results
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                delay = self.backoff_factor ** attempt
                self.logger.warning(
                    "scrape_retry",
                    attempt=attempt,
                    error=str(exc),
                    next_delay=round(delay, 2),
                )
                if attempt < self.max_retries:
                    await asyncio.sleep(delay)

        self.logger.error("scrape_failed_all_retries", error=str(last_exc))
        raise RuntimeError(
            f"{self.__class__.__name__}: all {self.max_retries} retries exhausted"
        ) from last_exc

    # ------------------------------------------------------------------ #
    #  Public API
    # ------------------------------------------------------------------ #
    async def scrape(
        self,
        query: str,
        max_results: int = 50,
    ) -> list[dict[str, Any]]:
        """Scrape data for *query*, returning up to *max_results* items.

        Delegates to :py:meth:`_scrape_impl` via the retry wrapper.
        """
        return await self._execute_with_retry(query, max_results)

    # ------------------------------------------------------------------ #
    #  Subclass contract
    # ------------------------------------------------------------------ #
    @abc.abstractmethod
    async def _scrape_impl(
        self,
        query: str,
        max_results: int,
    ) -> list[dict[str, Any]]:
        """Override in subclasses to perform the actual scraping."""
        ...
