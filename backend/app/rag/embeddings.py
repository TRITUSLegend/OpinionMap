"""
Embedding generator for ChromaDB vector storage.

Uses Google Gemini text-embedding-004 (768-dim) when a GEMINI_API_KEY is
configured. Falls back to deterministic TF-IDF-style sparse vectors so
ChromaDB remains functional (though with degraded recall) without an API key.
"""

import asyncio
import hashlib
import math

import google.generativeai as genai

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_EMBEDDING_DIM = 768  # text-embedding-004 output dimension


class EmbeddingGenerator:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def generate(self, texts: list[str]) -> list[list[float]]:
        """Return one embedding vector per text.

        Tries Gemini text-embedding-004 first; falls back to a deterministic
        sparse vector if the API is unavailable.
        """
        if not texts:
            return []

        if settings.GEMINI_API_KEY:
            try:
                result = await asyncio.to_thread(
                    genai.embed_content,
                    model="models/text-embedding-004",
                    content=texts,
                )
                embeddings = result.get("embedding") if isinstance(result, dict) else result
                # embed_content returns a single vector for a single string,
                # or a list of vectors for a list — normalise to list[list[float]]
                if embeddings and isinstance(embeddings[0], float):
                    embeddings = [embeddings]
                logger.debug(f"Gemini embeddings generated for {len(texts)} texts")
                return embeddings
            except Exception as e:
                logger.warning(f"Gemini embedding failed, using sparse fallback: {e}")

        return self._sparse_fallback(texts)

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
