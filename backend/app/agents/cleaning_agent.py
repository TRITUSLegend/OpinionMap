import time
import re
from app.agents.state import AgentState
from app.core.logging import get_logger

logger = get_logger(__name__)

def clean_text(text: str) -> str:
    if not text:
        return ""
    # Remove URLs
    text = re.sub(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', '', text)
    # Remove special characters but keep basic punctuation
    text = re.sub(r'[^\w\s.,!?\'"-]', '', text)
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def is_english_simple(text: str) -> bool:
    # Very simple heuristic for english detection
    # In a real app use langdetect or fasttext
    common_words = {'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this'}
    words = set(text.lower().split())
    # If at least 1 common English word is present, or text is too short to tell
    return len(words.intersection(common_words)) > 0 or len(words) < 5

async def cleaning_node(state: AgentState) -> AgentState:
    logger.info("Agent starting: Cleaning", workflow_id=state.get("workflow_id"))
    state["current_agent"] = "cleaning"
    start_time = time.time()
    
    raw_data = state.get("raw_data", [])
    cleaned_data = []
    seen_content = set()
    
    for item in raw_data:
        content = item.get("content", "")
        
        # 1. Clean text
        cleaned_content = clean_text(content)
        
        # 2. Filter short/empty
        if len(cleaned_content) < 10:
            continue
            
        # 3. Deduplicate
        content_hash = hash(cleaned_content.lower())
        if content_hash in seen_content:
            continue
        seen_content.add(content_hash)
        
        # 4. Filter non-English
        if not is_english_simple(cleaned_content):
            continue
            
        cleaned_item = item.copy()
        cleaned_item["content"] = cleaned_content
        cleaned_data.append(cleaned_item)
        
    state["cleaned_data"] = cleaned_data
    
    execution_time = int((time.time() - start_time) * 1000)
    
    if "agent_logs" not in state:
        state["agent_logs"] = []
        
    state["agent_logs"].append({
        "agent_name": "cleaning",
        "status": "completed",
        "input_data": {"raw_count": len(raw_data)},
        "output_data": {"cleaned_count": len(cleaned_data), "removed": len(raw_data) - len(cleaned_data)},
        "execution_time_ms": execution_time
    })
    
    return state
