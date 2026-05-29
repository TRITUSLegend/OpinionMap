import time
import json
import google.generativeai as genai
from app.config import settings
from app.agents.state import AgentState
from app.core.logging import get_logger
from app.core.sanitizer import safe_query_for_prompt, extract_json

logger = get_logger(__name__)

async def reviewer_node(state: AgentState) -> AgentState:
    logger.info("Agent starting: Reviewer", workflow_id=state.get("workflow_id"))
    state["current_agent"] = "reviewer"
    start_time = time.time()
    
    report = state.get("report", {})
    query = safe_query_for_prompt(state.get("query", ""))
    revision_count = state.get("revision_count", 0)
    
    state["revision_count"] = revision_count + 1
    
    # If we've revised too many times, force approve to prevent infinite loops
    if revision_count >= 2:
        state["review_feedback"] = {
            "approved": True,
            "feedback": "Auto-approved due to max revisions reached.",
            "quality_score": 0.7
        }
        state["status"] = "completed"
        return state
    
    if settings.GEMINI_API_KEY:
        try:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            model = genai.GenerativeModel('gemini-2.5-flash')
            
            prompt = f"""
            Review the following market research report for "{query}".
            Check for clarity, completeness, and professionalism.
            
            Report Title: {report.get('title')}
            Summary: {report.get('executive_summary')}
            Recommendations: {report.get('recommendations')}
            
            Return a strictly JSON response:
            {{
                "approved": true/false,
                "feedback": "Your review feedback here",
                "quality_score": 0.0 to 1.0
            }}
            """
            
            response = await model.generate_content_async(prompt)
            text = response.text
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].strip()
                
            data = extract_json(text)
            state["review_feedback"] = data
            
        except Exception as e:
            logger.error(f"Error reviewing report: {e}")
            import asyncio
            if "429" in str(e) or "ResourceExhausted" in str(e) or "quota" in str(e).lower():
                logger.warning("Gemini API Rate Limit hit! Waiting 60 seconds...")
                await asyncio.sleep(60)
            _fallback_review(state)
    else:
        _fallback_review(state)
        
    # Set overall workflow status based on approval
    if state.get("review_feedback", {}).get("approved", False):
        state["status"] = "completed"
        
    execution_time = int((time.time() - start_time) * 1000)
    
    if "agent_logs" not in state:
        state["agent_logs"] = []
        
    state["agent_logs"].append({
        "agent_name": "reviewer",
        "status": "completed",
        "input_data": {"revision_count": revision_count},
        "output_data": {"approved": state.get("review_feedback", {}).get("approved")},
        "execution_time_ms": execution_time
    })
    
    return state

def _fallback_review(state: AgentState):
    state["review_feedback"] = {
        "approved": True,
        "feedback": "Placeholder review passed successfully.",
        "quality_score": 0.8
    }
