from langgraph.graph import StateGraph, END
from app.agents.state import AgentState
from app.agents.research_agent import research_node
from app.agents.cleaning_agent import cleaning_node
from app.agents.nlp_agent import nlp_node
from app.agents.insight_agent import insight_node
from app.agents.report_agent import report_node
from app.agents.reviewer_agent import reviewer_node

def create_workflow_graph() -> StateGraph:
    workflow = StateGraph(AgentState)
    
    # Add nodes
    workflow.add_node('research', research_node)
    workflow.add_node('cleaning', cleaning_node)
    workflow.add_node('nlp_analysis', nlp_node)
    workflow.add_node('insights', insight_node)
    workflow.add_node('report', report_node)
    workflow.add_node('reviewer', reviewer_node)
    
    # Add edges
    workflow.set_entry_point('research')
    workflow.add_edge('research', 'cleaning')
    workflow.add_edge('cleaning', 'nlp_analysis')
    workflow.add_edge('nlp_analysis', 'insights')
    workflow.add_edge('insights', 'report')
    workflow.add_edge('report', 'reviewer')
    
    # Conditional: reviewer can approve or send back for revision
    def should_continue(state: AgentState) -> str:
        if state.get('review_feedback', {}).get('approved', False):
            return 'end'
        return 'report'
        
    workflow.add_conditional_edges(
        'reviewer',
        should_continue,
        {'end': END, 'report': 'report'}
    )
    
    return workflow.compile()

async def run_workflow(query: str, sources: list[str], workflow_id: str) -> AgentState:
    graph = create_workflow_graph()
    
    initial_state = {
        "query": query,
        "workflow_id": workflow_id,
        "sources": sources,
        "raw_data": [],
        "cleaned_data": [],
        "sentiment_results": [],
        "topics": [],
        "keywords": [],
        "trends": {},
        "insights": {},
        "competitor_analysis": {},
        "pain_points": [],
        "report": {},
        "review_feedback": {},
        "status": "running",
        "errors": [],
        "agent_logs": [],
        "current_agent": "start",
        "revision_count": 0
    }
    
    # Run the graph
    # LangGraph compile() returns an object with an invoke method
    # Since we have async nodes, we use ainvoke
    final_state = await graph.ainvoke(initial_state)
    return final_state
