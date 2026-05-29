from app.core.logging import get_logger

logger = get_logger(__name__)

class TopicExtractor:
    def extract_topics(self, texts: list[str], n_topics: int = 5) -> list[dict]:
        if not texts:
            return [{"topic_id": 0, "keywords": ["insufficient data"], "weight": 1.0}]
            
        topics = []
        for i in range(min(n_topics, len(texts))):
            topics.append({
                "topic_id": i,
                "keywords": ["topic", f"keyword_{i}"],
                "weight": 1.0 / n_topics
            })
        return topics
