import time
import json
import google.generativeai as genai
from app.config import settings
from app.agents.state import AgentState
from app.core.logging import get_logger
from app.core.sanitizer import safe_query_for_prompt, extract_json
from app.core.retry import gemini_backoff

logger = get_logger(__name__)

async def insight_node(state: AgentState) -> AgentState:
    logger.info("Agent starting: Insight Generation", workflow_id=state.get("workflow_id"))
    state["current_agent"] = "insights"
    start_time = time.time()
    
    query = safe_query_for_prompt(state.get("query", ""))
    topics = state.get("topics", [])
    keywords = state.get("keywords", [])
    trends = state.get("trends", {})
    
    # Try Gemini if available
    if settings.GEMINI_API_KEY:
        try:
            model = genai.GenerativeModel(
                'gemini-2.5-flash',
                generation_config={"response_mime_type": "application/json"}
            )
            
            prompt = f"""Analyze the following research data for the query: "{query}".

This query could be about ANYTHING — a product, a geopolitical event, a health topic, a technology, a social issue, etc. Adapt your analysis to what the query actually is.

Topics Extracted: {json.dumps(topics, indent=2)}
Keywords: {json.dumps(keywords, indent=2)}
Trend Data: {json.dumps(trends, indent=2)}

Generate a JSON response with the following structure:
{{
    "insights": {{
        "summary": "A substantive summary of the key findings about '{query}'. Use real facts and specific observations.",
        "key_trends": ["3-5 specific trends or patterns observed, relevant to the query type"]
    }},
    "competitor_analysis": {{
        "top_competitors": ["For products: name real competitor brands. For geopolitical topics: name key countries/organizations involved. For health topics: name alternative treatments or research institutions. For other topics: name key related entities or opposing viewpoints. Always use REAL names."],
        "strengths": ["Real strengths or advantages relevant to the topic"],
        "weaknesses": ["Real weaknesses or disadvantages relevant to the topic"]
    }},
    "pain_points": [
        {{"issue": "A specific, real concern or problem related to {query}", "severity": "High/Medium/Low", "frequency": "Common/Rare"}}
    ]
}}

CRITICAL: Use REAL entity names. Do NOT use placeholders like "Leading competitors to {query}" or "Issues with [keyword]". If you don't know specific entities, describe the general category accurately instead."""
            
            response = await model.generate_content_async(prompt)
            data = extract_json(response.text)
            
            state["insights"] = data.get("insights", {})
            state["competitor_analysis"] = data.get("competitor_analysis", {})
            state["pain_points"] = data.get("pain_points", [])
            
        except Exception as e:
            await gemini_backoff(attempt=0, error=e, context="insight_node")
            _fallback_insights(state)
    else:
        _fallback_insights(state)
        
    execution_time = int((time.time() - start_time) * 1000)
    
    if "agent_logs" not in state:
        state["agent_logs"] = []
        
    state["agent_logs"].append({
        "agent_name": "insights",
        "status": "completed",
        "input_data": {"query": query},
        "output_data": {"pain_points_found": len(state.get("pain_points", []))},
        "execution_time_ms": execution_time
    })
    
    return state

def _fallback_insights(state: AgentState):
    """Topic-agnostic fallback when Gemini is unavailable."""
    query = state.get("query", "")
    keywords = state.get("keywords", [])
    
    top_words = [k["keyword"] for k in keywords[:5]] if keywords else []
    keyword_summary = ", ".join(top_words) if top_words else "various aspects of the topic"
    
    state["insights"] = {
        "summary": f"Analysis of '{query}' identified key discussion themes around {keyword_summary}. Further AI-powered analysis is recommended for deeper insights.",
        "key_trends": [
            "Active public discourse across multiple platforms",
            "Evolving perspectives driven by new developments"
        ]
    }
    # Do NOT generate fake competitor/entity names — leave empty so the report
    # agent knows there's no real data and won't parrot garbage placeholders.
    state["competitor_analysis"] = {
        "top_competitors": [],
        "strengths": [],
        "weaknesses": []
    }
    state["pain_points"] = []

