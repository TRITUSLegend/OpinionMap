import asyncio
from app.core.logging import get_logger

logger = get_logger(__name__)

class SentimentAnalyzer:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(SentimentAnalyzer, cls).__new__(cls)
            cls._instance.pipeline = None
            logger.info("Using lightweight fallback sentiment analyzer (OOM prevention)")
        return cls._instance

    async def analyze(self, texts: list[str]) -> list[dict]:
        if not texts:
            return []
            
        if self.pipeline is None:
            logger.warning("Pipeline not loaded, using fallback rule-based sentiment")
            return [self._fallback_analyze(text) for text in texts]
            
        try:
            # Run in executor to avoid blocking the event loop
            results = await asyncio.to_thread(self.pipeline, texts)
            
            # Format output consistently
            formatted_results = []
            for res in results:
                formatted_results.append({
                    "label": res["label"],
                    "score": res["score"]
                })
            return formatted_results
        except Exception as e:
            logger.error(f"Error during sentiment analysis: {e}")
            return [self._fallback_analyze(text) for text in texts]
            
    def _fallback_analyze(self, text: str) -> dict:
        text_lower = text.lower()
        positive_words = ['good', 'great', 'excellent', 'amazing', 'love', 'best', 'awesome', 'perfect']
        negative_words = ['bad', 'terrible', 'awful', 'hate', 'worst', 'poor', 'disappointing', 'junk']
        
        pos_count = sum(1 for word in positive_words if word in text_lower)
        neg_count = sum(1 for word in negative_words if word in text_lower)
        
        if pos_count > neg_count:
            return {"label": "POSITIVE", "score": 0.8}
        elif neg_count > pos_count:
            return {"label": "NEGATIVE", "score": 0.8}
        else:
            return {"label": "NEUTRAL", "score": 0.5}
