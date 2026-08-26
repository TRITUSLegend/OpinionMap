import time
import json
import google.generativeai as genai
from app.config import settings
from app.agents.state import AgentState
from app.core.logging import get_logger
from app.core.sanitizer import safe_query_for_prompt, extract_json
from app.core.retry import gemini_backoff

logger = get_logger(__name__)

async def report_node(state: AgentState) -> AgentState:
    logger.info("Agent starting: Report Generation", workflow_id=state.get("workflow_id"))
    state["current_agent"] = "report"
    start_time = time.time()
    
    # Sanitize query before inserting into any prompt
    query = safe_query_for_prompt(state.get("query", ""))
    insights = state.get("insights", {})
    competitors = state.get("competitor_analysis", {})
    pain_points = state.get("pain_points", [])
    trends = state.get("trends", {})
    
    if settings.GEMINI_API_KEY:
        try:
            model = genai.GenerativeModel(
                'gemini-2.5-flash',
                generation_config={"response_mime_type": "application/json"}
            )
            
            # Build context — but ONLY include real data, filter out fallback garbage
            context_parts = []
            
            # Check if insight data is real (not fallback)
            if insights and isinstance(insights, dict):
                summary = insights.get("summary", "")
                if summary and "Initial analysis of" not in summary and "Competitor A" not in str(insights):
                    context_parts.append(f"Research Insights: {json.dumps(insights)}")
            
            if competitors and isinstance(competitors, dict):
                comps = competitors.get("top_competitors", [])
                if comps and "Competitor A" not in str(comps) and "Leading competitors to" not in str(comps):
                    context_parts.append(f"Related Entities: {json.dumps(competitors)}")
            
            if pain_points and isinstance(pain_points, list) and len(pain_points) > 0:
                first_pain = str(pain_points[0]) if pain_points else ""
                if "Issues with" not in first_pain and "Concerns about" not in first_pain:
                    context_parts.append(f"Key Concerns: {json.dumps(pain_points)}")
            
            if trends and isinstance(trends, dict) and len(trends) > 0:
                context_parts.append(f"Trends: {json.dumps(trends)}")
            
            has_real_data = len(context_parts) > 0
            context_block = "\n".join(context_parts) if has_real_data else "No pipeline data available."
            
            prompt = f"""You are an elite research analyst. Your job is to write a comprehensive, intelligent report about ANY topic a user asks about. The topic is: "{query}".

STEP 1 — CLASSIFY THE QUERY TYPE:
First, determine what kind of topic "{query}" is. It could be:
- A PRODUCT or BRAND (e.g., "iPhone 16", "Nike Air Max", "vivo x300pro")
- A GEOPOLITICAL EVENT (e.g., "russia ukraine war", "US-China trade war", "Brexit")
- A HEALTH/SCIENCE TOPIC (e.g., "effects of whey protein on body", "climate change", "mRNA vaccines")
- A SOCIAL/CULTURAL TOPIC (e.g., "impact of social media on teens", "remote work trends")
- A TECHNOLOGY TOPIC (e.g., "artificial intelligence", "blockchain", "quantum computing")
- A FINANCIAL TOPIC (e.g., "cryptocurrency market", "inflation 2024", "stock market crash")
- A PERSON or ORGANIZATION (e.g., "Elon Musk", "WHO", "NASA")
- Or any other category — adapt accordingly.

STEP 2 — GENERATE CONTEXTUALLY APPROPRIATE SECTIONS:
Based on the query type, generate sections that MAKE SENSE for that topic. Do NOT force product/brand sections onto non-product topics.

CRITICAL RULES:
1. USE YOUR OWN KNOWLEDGE about "{query}". Write with REAL facts, REAL names, REAL data, REAL events.
2. EVERY section must contain specific, factual, substantive information. No vague filler.
3. Do NOT use generic placeholders like "Competitor A", "leading incumbents", "key stakeholders". Name real entities.
4. Sections must be RELEVANT to the query type. A war report should NOT have "Business Model" or "Pricing Strategy". A health topic should NOT have "Core Features" or "Target Audience".
5. Each section: 150-300 words of substantive, specific analysis.
6. Use \\n to separate paragraphs within sections.

{"Additional research context from our data pipeline:" + chr(10) + context_block if has_real_data else "Note: No additional pipeline data was gathered. Rely entirely on your own knowledge."}

Return JSON matching this exact schema:
{{
    "title": "A professional, specific title for this report about {query}",
    "tagline": "A compelling 1-sentence subtitle capturing the essence of this analysis",
    "executive_summary": "3-paragraph executive summary that is SPECIFIC to {query}: (1) What this topic is, its background/history, and why it matters RIGHT NOW, (2) Current state of affairs — key developments, major players/stakeholders, and dynamics, (3) Forward-looking assessment and key takeaways. Write with real facts and real names.",
    "recommendations": ["5 specific, actionable recommendations or key takeaways relevant to {query} — these should match the topic type (e.g., policy recommendations for geopolitical topics, health advice for health topics, strategic moves for products)"],
    "sections": {{
        "Overview & Background": "Comprehensive introduction to {query}. History, context, origin, and why this topic is significant. Use real dates, real names, real events.",
        "Current Landscape": "What is happening RIGHT NOW with {query}. Latest developments, current status, key metrics or data points. Name real entities and cite real events.",
        "Key Players & Stakeholders": "Who are the major entities involved? For products: real competitors. For geopolitical: real countries/leaders/organizations. For health: real researchers/institutions. For tech: real companies. Name them ALL by name.",
        "Impact Analysis": "What impact does {query} have? Economic, social, political, technological, environmental, or health impacts as relevant. Use real data and statistics where possible.",
        "Public Sentiment & Discourse": "How do people feel about {query}? What are the dominant opinions, debates, controversies? What do experts say vs. what does the public think? Reference real polls, surveys, social media trends, or expert opinions.",
        "Challenges & Risks": "What are the real problems, risks, obstacles, or controversies around {query}? Be specific — name real issues, not generic concerns.",
        "Opportunities & Positive Developments": "What are the bright spots? Positive trends, breakthroughs, opportunities, or silver linings related to {query}?",
        "Comparative Analysis": "How does {query} compare to similar topics, competing entities, alternative approaches, or historical precedents? Draw specific parallels.",
        "Expert Perspectives": "What do leading experts, analysts, or authorities say about {query}? Reference real people and real viewpoints where possible.",
        "Future Outlook": "Where is {query} heading? Predictions, emerging trends, potential scenarios. What should people watch for?",
        "Strategic Recommendations": "5-7 specific, actionable recommendations that are appropriate for the topic type of {query}.",
        "Conclusion": "Professional closing summary tying together the key findings about {query}."
    }},
    "advanced_metrics": {{
        "Significance Score": "X.X/10 - How important/impactful is {query} right now and why",
        "Public Interest Level": "X.X/10 - How much public attention {query} is receiving",
        "Complexity Rating": "X.X/10 - How complex/nuanced the topic is",
        "Sentiment Balance": "XX% positive / XX% negative - overall sentiment breakdown",
        "Outlook": "Positive/Mixed/Negative/Uncertain - brief justification"
    }}
}}"""
            
            response = await model.generate_content_async(prompt)
            data = extract_json(response.text)
            
            # Validate that the report is actually about the query (not generic)
            exec_summary = data.get("executive_summary", "")
            query_words = query.lower().split()
            is_relevant = any(w in exec_summary.lower() for w in query_words if len(w) > 3)
            
            if is_relevant or len(exec_summary) > 200:
                state["report"] = data
                logger.info("Gemini report generated successfully")
            else:
                logger.warning("Gemini returned generic report, using it anyway as it has content")
                state["report"] = data
                
        except Exception as e:
            await gemini_backoff(attempt=0, error=e, context="report_node primary")

            # Retry with a simpler prompt
            try:
                simple_model = genai.GenerativeModel(
                    'gemini-2.5-flash',
                    generation_config={"response_mime_type": "application/json"}
                )
                simple_prompt = f"""Write an intelligent research report about "{query}" using your own knowledge. This could be ANY topic — a product, a war, a health issue, a technology, a person, etc. Adapt your analysis to the topic type. Use REAL facts, REAL names, REAL data. Do NOT use placeholders like "Competitor A" or treat non-products as products.

Return JSON with keys: title (string), tagline (string), executive_summary (string, 2-3 paragraphs with real facts about {query}), recommendations (list of 5 specific strings appropriate to the topic), sections (object with "Overview & Background", "Current Landscape", "Key Players & Stakeholders", "Impact Analysis", "Public Sentiment", "Challenges & Risks", "Future Outlook", "Conclusion" — each a detailed string paragraph with REAL information about {query}), advanced_metrics (object with "Significance Score", "Public Interest Level", "Outlook" as strings with scores and justifications)."""
                
                simple_response = await simple_model.generate_content_async(simple_prompt)
                data = extract_json(simple_response.text)
                state["report"] = data
                logger.info("Simple fallback Gemini report generated")
            except Exception as e2:
                await gemini_backoff(attempt=1, error=e2, context="report_node retry")
                _fallback_report(state)
    else:
        _fallback_report(state)
        
    execution_time = int((time.time() - start_time) * 1000)
    
    if "agent_logs" not in state:
        state["agent_logs"] = []
        
    state["agent_logs"].append({
        "agent_name": "report",
        "status": "completed",
        "input_data": {"query": query},
        "output_data": {"report_generated": bool(state.get("report"))},
        "execution_time_ms": execution_time
    })
    
    return state

def _fallback_report(state: AgentState):
    """Last-resort fallback when Gemini is unavailable. Uses neutral, topic-agnostic language."""
    query = state.get("query", "")
    q = query.title()
    
    insights = state.get("insights", {})
    competitors = state.get("competitor_analysis", {})
    pain_points = state.get("pain_points", [])
    sentiment_results = state.get("sentiment_results", [])
    
    # Extract real data if available, but avoid using broken fallback patterns
    related_entities = []
    if isinstance(competitors, dict):
        comps = competitors.get("top_competitors", [])
        if comps and "Competitor A" not in str(comps) and "Leading competitors" not in str(comps):
            related_entities = comps[:5]
    
    key_concerns = []
    if pain_points and isinstance(pain_points, list):
        for p in pain_points[:3]:
            if isinstance(p, dict):
                issue = p.get("issue", "")
                if issue and "Issues with" not in issue and "Concerns about" not in issue:
                    key_concerns.append(issue)
    
    insight_summary = ""
    if isinstance(insights, dict):
        summary = insights.get("summary", "")
        if summary and "Initial analysis of" not in summary:
            insight_summary = summary
    
    # Build sentiment summary from real data
    sentiment_summary = ""
    if sentiment_results and isinstance(sentiment_results, list):
        pos = sum(1 for s in sentiment_results if isinstance(s, dict) and s.get("label") == "positive")
        neg = sum(1 for s in sentiment_results if isinstance(s, dict) and s.get("label") == "negative")
        neu = sum(1 for s in sentiment_results if isinstance(s, dict) and s.get("label") == "neutral")
        total = pos + neg + neu
        if total > 0:
            sentiment_summary = (
                f"Based on analysis of {total} data points, sentiment breaks down as: "
                f"{pos} positive ({round(pos/total*100)}%), "
                f"{neg} negative ({round(neg/total*100)}%), "
                f"and {neu} neutral ({round(neu/total*100)}%)."
            )
    
    entities_str = ", ".join(related_entities) if related_entities else "various key stakeholders"
    concerns_str = "; ".join(key_concerns) if key_concerns else "multiple areas of public debate and discussion"
    
    state["report"] = {
        "title": f"{q} (Basic Report - AI Quota Exceeded)",
        "tagline": f"Note: Your Gemini API key is out of quota. This is a generic fallback report.",
        "executive_summary": (
            f"⚠️ **API QUOTA EXCEEDED**: The Gemini AI could not generate this report because your API key has hit its rate limit or daily quota. The system has generated this basic placeholder report instead.\n\n"
            f"This basic report presents a high-level view of '{query}'. "
            f"The research examines the current state of affairs, public discourse, key developments, "
            f"and emerging trends related to this topic. {insight_summary}\n\n"
            f"Analysis of publicly available data reveals multiple dimensions to this subject. "
            f"Key entities and stakeholders include {entities_str}. "
            f"Public discussion centers around {concerns_str}. "
            f"{sentiment_summary}\n\n"
            f"Please upgrade your Gemini API tier or wait for your quota to reset for full AI analysis."
        ),
        "recommendations": [
            f"Continue monitoring developments related to {query} for evolving trends.",
            f"Consider multiple perspectives and data sources when forming conclusions about {query}.",
            f"Track public sentiment and discourse shifts around this topic.",
            f"Engage with expert analysis and authoritative sources for deeper understanding.",
            f"Evaluate the broader implications and ripple effects of {query} across related domains."
        ],
        "sections": {
            "Overview & Background": (
                f"'{q}' is a topic of significant interest and public discourse. "
                f"This analysis examines the subject from multiple angles, drawing on available "
                f"data and public sources to provide a comprehensive overview.\n\n"
                f"Understanding the background and context of {query} is essential for "
                f"informed analysis. The topic intersects with multiple domains and affects "
                f"various stakeholders in different ways."
            ),
            "Current Landscape": (
                f"The current state of {query} is shaped by ongoing developments and "
                f"evolving circumstances. Public interest and media coverage indicate "
                f"that this remains a highly relevant and actively discussed topic.\n\n"
                f"Recent developments have brought new dimensions to the discussion, "
                f"with stakeholders including {entities_str} playing significant roles "
                f"in shaping the current landscape."
            ),
            "Key Players & Stakeholders": (
                f"Multiple entities and stakeholders are involved in or affected by {query}. "
                f"Key players include {entities_str}.\n\n"
                f"Each stakeholder brings different perspectives, interests, and influence "
                f"to the broader discussion. Understanding these dynamics is crucial for "
                f"a complete picture of the topic."
            ),
            "Impact Analysis": (
                f"The impact of {query} extends across multiple dimensions. "
                f"Social, economic, and political implications have been identified "
                f"through analysis of public discourse and available data.\n\n"
                f"Both direct and indirect effects continue to unfold, with "
                f"long-term implications that warrant ongoing monitoring and analysis."
            ),
            "Public Sentiment & Discourse": (
                f"Public sentiment regarding {query} is multifaceted. "
                f"{sentiment_summary if sentiment_summary else 'Analysis of public discourse reveals a range of opinions and perspectives on this topic.'}\n\n"
                f"Key areas of discussion include {concerns_str}. "
                f"Social media and public forums show active engagement with this topic, "
                f"reflecting its significance in public consciousness."
            ),
            "Challenges & Risks": (
                f"Several challenges and risks are associated with {query}. "
                f"Key concerns identified through analysis include {concerns_str}.\n\n"
                f"These challenges require careful consideration and proactive approaches "
                f"to address potential negative outcomes while maximizing positive developments."
            ),
            "Opportunities & Positive Developments": (
                f"Despite the challenges, there are positive developments and opportunities "
                f"related to {query}. Increased public awareness and engagement suggest "
                f"growing momentum for constructive outcomes.\n\n"
                f"Emerging trends point toward potential improvements and positive shifts "
                f"that could reshape the landscape around this topic."
            ),
            "Future Outlook": (
                f"The trajectory of {query} will be shaped by multiple factors, "
                f"including the actions of key stakeholders, public sentiment shifts, "
                f"and broader contextual developments.\n\n"
                f"Continued monitoring of developments, stakeholder positions, and "
                f"emerging data will be essential for understanding how this topic evolves."
            ),
            "Conclusion": (
                f"This analysis of {query} reveals a complex, multi-dimensional topic "
                f"with significant implications across multiple domains. "
                f"Key findings highlight the importance of ongoing engagement with "
                f"this subject and the need for nuanced, evidence-based perspectives.\n\n"
                f"The recommendations outlined in this report aim to support informed "
                f"decision-making and deeper understanding of {query} and its broader impact."
            )
        },
        "advanced_metrics": {
            "Significance Score": f"7.5/10 - {q} is a topic of considerable public interest and relevance",
            "Public Interest Level": f"8.0/10 - High levels of public engagement and media coverage",
            "Complexity Rating": f"7.5/10 - Multiple dimensions and stakeholders contribute to topic complexity",
            "Sentiment Balance": f"Mixed - Public opinion spans a range of perspectives on {query}",
            "Outlook": f"Evolving - The trajectory of {query} continues to develop with emerging factors"
        }
    }
