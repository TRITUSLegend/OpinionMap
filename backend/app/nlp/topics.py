from app.core.logging import get_logger

logger = get_logger(__name__)


class TopicExtractor:
    """
    Extracts topic clusters from a list of texts using keyword co-occurrence.

    Uses a singleton pattern (consistent with SentimentAnalyzer and KeywordExtractor)
    so the instance is reused across workflow runs rather than re-created each time.
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def extract_topics(self, texts: list[str], n_topics: int = 5) -> list[dict]:
        if not texts:
            return [{"topic_id": 0, "keywords": ["insufficient data"], "weight": 1.0}]

        # Build a per-item word set for co-occurrence grouping
        stop_words = {
            'the', 'a', 'to', 'and', 'is', 'in', 'it', 'of', 'for', 'on',
            'with', 'that', 'this', 'i', 'was', 'are', 'be', 'as', 'at',
            'by', 'we', 'or', 'an', 'but', 'not', 'so', 'if', 'my', 'your',
            'have', 'had', 'has', 'he', 'she', 'they', 'you', 'me', 'him',
            'her', 'its', 'our', 'their', 'do', 'did', 'will', 'just', 'from',
            'get', 'got', 'been', 'than', 'then', 'when', 'what', 'which',
            'who', 'how', 'all', 'can', 'no', 'more', 'also', 'very',
        }

        def tokenize(text: str) -> list[str]:
            words = ''.join(c if c.isalnum() else ' ' for c in text.lower()).split()
            return [w for w in words if w not in stop_words and len(w) > 3]

        # Count global word frequency across all texts
        global_freq: dict[str, int] = {}
        item_words: list[set[str]] = []
        for text in texts:
            tokens = set(tokenize(text))
            item_words.append(tokens)
            for w in tokens:
                global_freq[w] = global_freq.get(w, 0) + 1

        if not global_freq:
            return [{"topic_id": 0, "keywords": ["insufficient data"], "weight": 1.0}]

        # Take the top-N*3 most frequent words as candidate topic seeds
        top_words = sorted(global_freq, key=lambda w: global_freq[w], reverse=True)
        candidates = top_words[:n_topics * 3]

        # Greedily build topic clusters: for each seed, find other candidates
        # that most frequently co-occur with it in the same item
        used: set[str] = set()
        topics: list[dict] = []

        for seed in candidates:
            if seed in used or len(topics) >= n_topics:
                break

            # Co-occurrence: count items that contain both seed and each other candidate
            co_counts: dict[str, int] = {}
            for item_set in item_words:
                if seed in item_set:
                    for other in candidates:
                        if other != seed and other not in used and other in item_set:
                            co_counts[other] = co_counts.get(other, 0) + 1

            # Top co-occurring words form this topic cluster
            cluster = [seed] + sorted(co_counts, key=lambda w: co_counts[w], reverse=True)[:3]
            used.update(cluster)

            total = len(texts)
            weight = round(global_freq[seed] / total, 4) if total > 0 else 0.0

            topics.append({
                "topic_id": len(topics),
                "keywords": cluster,
                "weight": weight,
            })

        # Pad with empty topics if we couldn't fill all n_topics slots
        while len(topics) < n_topics and len(topics) < len(texts):
            topics.append({
                "topic_id": len(topics),
                "keywords": ["miscellaneous"],
                "weight": 0.0,
            })

        return topics
