"""
In-memory sliding-window rate limiter.

Per process: the counts reset on restart and are not shared between workers.
That is enough to stop one account from burning the Gemini quota on a single
instance, which is all it is for.
"""

import time
from collections import defaultdict, deque


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: float = 60.0):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        """Record a hit for ``key`` and return False if it is over the limit."""
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] >= self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            return False
        hits.append(now)
        return True

    def reset(self) -> None:
        self._hits.clear()
