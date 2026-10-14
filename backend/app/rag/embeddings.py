"""
Embedding generator for ChromaDB vector storage.

Uses the Gemini model in settings.EMBEDDING_MODEL (gemini-embedding-001, cut to
768 dimensions) when a GEMINI_API_KEY is configured.

generate() falls back to deterministic TF-IDF-style sparse vectors so the
legacy /api/rag path stays functional (though with degraded recall) without an
API key. embed_strict() never falls back: Ask AI compares similarities with a
threshold, which only means something for real semantic embeddings.
"""

import asyncio
import hashlib
import math
import re

import google.generativeai as genai

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_EMBEDDING_DIM = settings.EMBEDDING_DIM
_RETRY_IN = re.compile(r"retry in ([\d.]+)\s*s|seconds:\s*(\d+)", re.IGNORECASE)


class EmbeddingError(RuntimeError):
    """Embeddings could not be produced (no API key, quota, or an API error)."""

    def __init__(self, message: str, daily_quota: bool = False):
        super().__init__(message)
        # The free tier's 1,000 texts a day are used up: retrying today won't help.
        self.daily_quota = daily_quota


def _as_vectors(result) -> list[list[float]]:
    embeddings = result.get("embedding") if isinstance(result, dict) else result
    # embed_content returns a single vector for a single string,
    # or a list of vectors for a list — normalise to list[list[float]]
    if embeddings and isinstance(embeddings[0], float):
        embeddings = [embeddings]
    return embeddings


def _retry_after(error: Exception) -> float | None:
    """Seconds to wait before retrying a rate-limited call, or None if waiting won't help.

    The free tier allows 100 embedding requests a minute and every text in a
    batch counts as one, so a workflow can need a minute or more. That is why
    this waits for the delay the API asks for instead of core/retry.py's
    16-second cap. A daily quota can't be waited out, so it fails at once.
    Transient server errors (500, 503, timeouts) get a short pause.
    """
    text = f"{type(error).__name__} {error}"
    if any(marker in text for marker in ("429", "ResourceExhausted", "quota")):
        if "PerDay" in text:
            return None
        match = _RETRY_IN.search(text)
        return float(match.group(1) or match.group(2)) + 1.0 if match else 15.0
    if any(marker in text for marker in ("InternalServerError", "ServiceUnavailable", "DeadlineExceeded", "500 ", "503 ", "504 ")):
        return 5.0
    return None


def failure_reason(error: BaseException) -> dict:
    """Loggable detail of why embedding failed: the underlying error's type and
    the start of its message (API errors name quotas, never request content)."""
    cause = error.__cause__ or error
    return {"cause": type(cause).__name__, "reason": str(cause)[:240]}


class EmbeddingGenerator:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def generate(self, texts: list[str]) -> list[list[float]]:
        """Return one embedding vector per text.

        Tries the Gemini embedding model first; falls back to a deterministic
        sparse vector if the API is unavailable.
        """
        if not texts:
            return []

        if settings.GEMINI_API_KEY:
            try:
                result = await asyncio.to_thread(
                    genai.embed_content,
                    model=settings.EMBEDDING_MODEL,
                    content=texts,
                    output_dimensionality=_EMBEDDING_DIM,
                )
                embeddings = _as_vectors(result)
                logger.debug(f"Gemini embeddings generated for {len(texts)} texts")
                return embeddings
            except Exception as e:
                logger.warning(f"Gemini embedding failed, using sparse fallback: {e}")

        return self._sparse_fallback(texts)

    async def embed_strict(self, texts: list[str], task_type: str, max_wait: float = 600.0) -> list[list[float]]:
        """Embed ``texts`` in batches with the Gemini model, or raise EmbeddingError.

        ``task_type`` is "retrieval_document" for stored chunks and
        "retrieval_query" for questions. A rate-limited batch waits for the delay
        the API asks for, up to ``max_wait`` seconds in total for the call; any
        other failure raises at once.
        """
        if not texts:
            return []
        if not settings.GEMINI_API_KEY:
            raise EmbeddingError("GEMINI_API_KEY is not set")

        vectors: list[list[float]] = []
        waited = 0.0
        size = settings.EMBEDDING_BATCH_SIZE
        for start in range(0, len(texts), size):
            batch = texts[start:start + size]
            while True:
                try:
                    result = await asyncio.to_thread(
                        genai.embed_content,
                        model=settings.EMBEDDING_MODEL,
                        content=batch,
                        task_type=task_type,
                        output_dimensionality=_EMBEDDING_DIM,
                    )
                    break
                except Exception as e:
                    delay = _retry_after(e)
                    if delay is None or waited + delay > max_wait:
                        raise EmbeddingError(
                            f"embedding failed: {type(e).__name__}", daily_quota="PerDay" in str(e),
                        ) from e
                    logger.warning("embedding_rate_limited", wait_seconds=round(delay, 1), task_type=task_type)
                    await asyncio.sleep(delay)
                    waited += delay
            batch_vectors = _as_vectors(result)
            if len(batch_vectors) != len(batch):
                raise EmbeddingError("embedding count did not match the input")
            vectors.extend(batch_vectors)
        return vectors

    def _sparse_fallback(self, texts: list[str]) -> list[list[float]]:
        """Deterministic sparse embedding using character n-gram hashing.

        Not suitable for semantic search, but at least gives different vectors
        for different texts (unlike the previous all-zeros approach), so
        ChromaDB's nearest-neighbour index is not completely broken.
        """
        results = []
        for text in texts:
            vec = [0.0] * _EMBEDDING_DIM
            # Slide a 3-gram window over the text and hash each n-gram into the vector
            padded = text.lower()
            for i in range(max(1, len(padded) - 2)):
                ngram = padded[i:i + 3]
                idx = int(hashlib.md5(ngram.encode()).hexdigest(), 16) % _EMBEDDING_DIM
                vec[idx] += 1.0
            # L2-normalise
            norm = math.sqrt(sum(v * v for v in vec)) or 1.0
            results.append([v / norm for v in vec])
        return results
