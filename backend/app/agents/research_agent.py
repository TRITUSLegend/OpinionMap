import asyncio
import time
from app.agents.state import AgentState
from app.scrapers.twitter import TwitterScraper
from app.scrapers.youtube import YouTubeScraper
from app.scrapers.reddit import RedditScraper
from app.core.logging import get_logger

logger = get_logger(__name__)

async def research_node(state: AgentState) -> AgentState:
    logger.info("Agent starting: Research", workflow_id=state.get("workflow_id"))
    state["current_agent"] = "research"
    start_time = time.time()
    
    query = state.get("query", "")
    sources = state.get("sources", [])
    
    raw_data = []
    errors = state.get("errors", [])
    
    scrapers = []
    if "twitter" in sources:
        scrapers.append(TwitterScraper().scrape(query))
    if "youtube" in sources:
        scrapers.append(YouTubeScraper().scrape(query))
    if "reddit" in sources:
        scrapers.append(RedditScraper().scrape(query))
        
    try:
        results = await asyncio.gather(*scrapers, return_exceptions=True)
        
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Scraping error: {result}")
                errors.append(str(result))
            elif isinstance(result, list):
                raw_data.extend(result)
    except Exception as e:
        logger.error(f"Critical error in research node: {e}")
        errors.append(str(e))
        
    state["raw_data"] = raw_data
    state["errors"] = errors
    
    execution_time = int((time.time() - start_time) * 1000)
    
    if "agent_logs" not in state:
        state["agent_logs"] = []
        
    state["agent_logs"].append({
        "agent_name": "research",
        "status": "completed",
        "input_data": {"query": query, "sources": sources},
        "output_data": {"data_points": len(raw_data)},
        "execution_time_ms": execution_time
    })
    
    return state
