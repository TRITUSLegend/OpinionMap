"""
AgentFlow AI — Query Sanitizer

Central input sanitization layer that sits between user input and LLM prompts.
Prevents prompt injection, enforces length limits, and strips dangerous patterns.
"""

import re
import json
from app.core.logging import get_logger

logger = get_logger(__name__)

# ── Constants ──────────────────────────────────────
MAX_QUERY_LENGTH = 500          # Max characters for user query
MAX_QUERY_WORDS = 60            # Max word count
MIN_QUERY_LENGTH = 2            # Reject empty/tiny queries

# Patterns that indicate prompt injection attempts
INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)",
    r"disregard\s+(all\s+)?(previous|above|prior)",
    r"you\s+are\s+now\s+(?:a|an|the)\s+",
    r"forget\s+(everything|all|your)\s+(you|instructions|rules)",
    r"new\s+instructions?\s*:",
    r"system\s*prompt\s*:",
    r"act\s+as\s+(?:a|an)\s+",
    r"pretend\s+(you\s+are|to\s+be)",
    r"roleplay\s+as",
    r"override\s+(your|the|all)\s+(instructions|rules|prompt)",
    r"do\s+not\s+follow\s+(your|the|previous)\s+(instructions|rules)",
    r"\[system\]",
    r"\[inst\]",
    r"<\s*system\s*>",
    r"<\s*/?\s*prompt\s*>",
    r"```\s*(system|instruction|prompt)",
    r"ADMIN\s*MODE",
    r"jailbreak",
    r"DAN\s*mode",
]

# Characters/sequences to strip (could break JSON or prompt structure)
DANGEROUS_CHARS = [
    '"""',           # Triple quotes could break f-string prompts
    "'''",
    "${",             # Template injection
    "{{",             # Jinja/prompt template escape
    "}}",
    "\\n\\n\\n",      # Excessive newlines
]


def sanitize_query(raw_query: str) -> tuple[str, list[str]]:
    """
    Sanitize user query before it touches any LLM prompt.
    
    Returns:
        tuple: (sanitized_query, list_of_warnings)
        
    Raises:
        ValueError: If the query is clearly malicious or invalid.
    """
    warnings = []
    
    if not raw_query or not raw_query.strip():
        raise ValueError("Query cannot be empty.")
    
    query = raw_query.strip()
    
    # ── 1. Length enforcement ──────────────────────
    if len(query) > MAX_QUERY_LENGTH:
        query = query[:MAX_QUERY_LENGTH]
        warnings.append(f"Query truncated to {MAX_QUERY_LENGTH} characters.")
        logger.warning("Query truncated", original_length=len(raw_query))
    
    word_count = len(query.split())
    if word_count > MAX_QUERY_WORDS:
        query = " ".join(query.split()[:MAX_QUERY_WORDS])
        warnings.append(f"Query truncated to {MAX_QUERY_WORDS} words.")
    
    if len(query.strip()) < MIN_QUERY_LENGTH:
        raise ValueError("Query is too short. Please enter a valid product or topic.")
    
    # ── 2. Strip dangerous characters ─────────────
    for char in DANGEROUS_CHARS:
        if char in query:
            query = query.replace(char, " ")
            warnings.append("Special characters removed.")
    
    # ── 3. Prompt injection detection ─────────────
    query_lower = query.lower()
    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, query_lower):
            logger.warning(
                "Prompt injection attempt detected",
                pattern=pattern,
                query_preview=query[:80]
            )
            raise ValueError(
                "Your query contains instructions that look like a prompt manipulation attempt. "
                "Please enter a normal product name or topic."
            )
    
    # ── 4. Normalize whitespace ───────────────────
    query = re.sub(r'\s+', ' ', query).strip()
    
    # ── 5. Strip any remaining control characters ─
    query = ''.join(c for c in query if c.isprintable())
    
    return query, warnings


def safe_query_for_prompt(query: str) -> str:
    """
    Wraps a sanitized query for safe insertion into an f-string prompt.
    Escapes any remaining characters that could interfere with prompt structure.
    """
    # Replace quotes that could break JSON schema examples in the prompt
    safe = query.replace('"', "'").replace("\\", "")
    return safe


def extract_json(text: str) -> dict:
    """
    Safely extract JSON from an LLM response, handling markdown fences.
    Sometimes Gemini returns ```json { ... } ``` even when mime_type is json.
    """
    try:
        # First try direct parse
        return json.loads(text)
    except json.JSONDecodeError:
        # If it fails, strip markdown json block
        match = re.search(r'```(?:json)?(.*?)```', text, re.DOTALL | re.IGNORECASE)
        if match:
            return json.loads(match.group(1).strip())
        # If still no match, try to find first { and last }
        start_idx = text.find('{')
        end_idx = text.rfind('}')
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            return json.loads(text[start_idx:end_idx+1])
        raise ValueError(f"Could not extract JSON from text: {text[:100]}...")
