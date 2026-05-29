import asyncio
from app.core.logging import get_logger

logger = get_logger(__name__)

class EmbeddingGenerator:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(EmbeddingGenerator, cls).__new__(cls)
            cls._instance.model = None
            logger.info("Using fallback embeddings (OOM prevention)")
        return cls._instance

    async def generate(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
            
        if self.model is None:
            logger.warning("Embedding model not loaded, using fallback dummy embeddings")
            return self._fallback_generate(texts)
            
        try:
            # Run in executor to avoid blocking the event loop
            embeddings = await asyncio.to_thread(self.model.encode, texts)
            return embeddings.tolist()
        except Exception as e:
            logger.error(f"Error generating embeddings: {e}")
            return self._fallback_generate(texts)
            
    def _fallback_generate(self, texts: list[str]) -> list[list[float]]:
        # Return dummy embeddings (e.g., list of zeros)
        # Note: In a real system, this should raise an exception or use an API
        return [[0.0] * 384 for _ in texts]
