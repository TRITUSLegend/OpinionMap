from uuid import UUID

from app.rag.retriever import RAGRetriever
from app.rag.vectorstore import workflow_collection_name

async def query_rag(question: str, workflow_id: UUID | None = None) -> dict:
    retriever = RAGRetriever()
    collection_name = workflow_collection_name(workflow_id) if workflow_id else "global_knowledge"
    return await retriever.query(question, collection_name)
