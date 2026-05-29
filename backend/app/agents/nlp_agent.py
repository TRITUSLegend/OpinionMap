import time
from app.agents.state import AgentState
from app.nlp.sentiment import SentimentAnalyzer
from app.nlp.topics import TopicExtractor
from app.nlp.keywords import KeywordExtractor
from app.nlp.trends import TrendAnalyzer
from app.core.logging import get_logger

logger = get_logger(__name__)

async def nlp_node(state: AgentState) -> AgentState:
    logger.info("Agent starting: NLP Analysis", workflow_id=state.get("workflow_id"))
    state["current_agent"] = "nlp_analysis"
    start_time = time.time()
    
    cleaned_data = state.get("cleaned_data", [])
    if not cleaned_data:
        logger.warning("No cleaned data available for NLP analysis")
        return state
        
    texts = [item.get("content", "") for item in cleaned_data]
    
    # Run NLP pipelines
    sentiment_analyzer = SentimentAnalyzer()
    sentiment_results = await sentiment_analyzer.analyze(texts)
    
    # Attach sentiment to data
    for i, item in enumerate(cleaned_data):
        if i < len(sentiment_results):
            item["sentiment_label"] = sentiment_results[i]["label"]
            item["sentiment_score"] = sentiment_results[i]["score"]
            
    topic_extractor = TopicExtractor()
    topics = topic_extractor.extract_topics(texts)
    
    keyword_extractor = KeywordExtractor()
    keywords = keyword_extractor.extract_keywords(texts)
    
    trend_analyzer = TrendAnalyzer()
    trends = trend_analyzer.analyze_trends(cleaned_data)
    
    # Update state
    state["sentiment_results"] = sentiment_results
    state["topics"] = topics
    state["keywords"] = keywords
    state["trends"] = trends
    
    execution_time = int((time.time() - start_time) * 1000)
    
    if "agent_logs" not in state:
        state["agent_logs"] = []
        
    state["agent_logs"].append({
        "agent_name": "nlp_analysis",
        "status": "completed",
        "input_data": {"count": len(texts)},
        "output_data": {"topics_found": len(topics), "keywords_found": len(keywords)},
        "execution_time_ms": execution_time
    })
    
    return state
