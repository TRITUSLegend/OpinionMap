from datetime import datetime
from typing import List, Dict, Any
from app.core.logging import get_logger

logger = get_logger(__name__)

class TrendAnalyzer:
    def analyze_trends(self, data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Analyzes sentiment over time based on provided data points.
        Expects data with 'date' and 'sentiment_score' or 'sentiment_label'.
        """
        if not data:
            return {"status": "insufficient_data"}
            
        try:
            # Sort by date
            # Assuming date strings can be sorted, or parse to datetime
            def get_date_str(item):
                meta = item.get("metadata", {})
                return meta.get("date", "2023-01-01")
                
            sorted_data = sorted(data, key=get_date_str)
            
            # Group into periods (simplified to sequence for now)
            # In a real app, you'd bin by day/week/month
            
            period_scores = []
            positive_count = 0
            negative_count = 0
            neutral_count = 0
            
            for item in sorted_data:
                label = item.get("sentiment_label", "NEUTRAL")
                
                if label == "POSITIVE":
                    positive_count += 1
                elif label == "NEGATIVE":
                    negative_count += 1
                else:
                    neutral_count += 1
                    
            total = len(data)
            
            # Simple trend detection
            first_half = sorted_data[:total//2]
            second_half = sorted_data[total//2:]
            
            def get_pos_ratio(half_data):
                if not half_data: return 0
                pos = sum(1 for d in half_data if d.get("sentiment_label") == "POSITIVE")
                return pos / len(half_data)
                
            first_ratio = get_pos_ratio(first_half)
            second_ratio = get_pos_ratio(second_half)
            
            trend_direction = "STABLE"
            if second_ratio > first_ratio + 0.1:
                trend_direction = "IMPROVING"
            elif second_ratio < first_ratio - 0.1:
                trend_direction = "DECLINING"

            return {
                "overall_positive_percentage": (positive_count / total) * 100 if total > 0 else 0,
                "trend_direction": trend_direction,
                "total_analyzed": total
            }
            
        except Exception as e:
            logger.error(f"Error analyzing trends: {e}")
            return {"status": "error", "message": str(e)}
