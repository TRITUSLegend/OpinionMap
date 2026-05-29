from app.core.logging import get_logger

logger = get_logger(__name__)

class KeywordExtractor:
    def __init__(self):
        self.rake = None
        logger.info("Using fallback keyword extractor (OOM prevention)")

    def extract_keywords(self, texts: list[str], top_n: int = 20) -> list[dict]:
        if not texts:
            return []
            
        if self.rake is None:
            return self._fallback_extract(texts, top_n)
            
        try:
            # Combine all texts
            combined_text = " ".join(texts)
            
            # Extract
            self.rake.extract_keywords_from_text(combined_text)
            
            # Get ranked phrases
            ranked_phrases = self.rake.get_ranked_phrases_with_scores()
            
            results = []
            for score, phrase in ranked_phrases[:top_n]:
                results.append({
                    "keyword": phrase,
                    "score": score,
                    "frequency": combined_text.lower().count(phrase.lower())
                })
                
            return results
        except Exception as e:
            logger.error(f"Error extracting keywords: {e}")
            return self._fallback_extract(texts, top_n)
            
    def _fallback_extract(self, texts: list[str], top_n: int) -> list[dict]:
        # Very simple word frequency counter as fallback
        combined_text = " ".join(texts).lower()
        words = ''.join(c if c.isalnum() else ' ' for c in combined_text).split()
        
        # Simple stop words
        stop_words = {'the', 'a', 'to', 'and', 'is', 'in', 'it', 'of', 'for', 'on', 'with', 'that', 'this', 'i'}
        filtered_words = [w for w in words if w not in stop_words and len(w) > 3]
        
        counts = {}
        for w in filtered_words:
            counts[w] = counts.get(w, 0) + 1
            
        sorted_words = sorted(counts.items(), key=lambda x: x[1], reverse=True)
        
        return [{"keyword": w, "score": float(c), "frequency": c} for w, c in sorted_words[:top_n]]
