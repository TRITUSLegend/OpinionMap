from app.rag.retriever import RAGRetriever

async def query_rag(question: str, workflow_id: str = None) -> dict:
    retriever = RAGRetriever()
    collection_name = f"workflow_{workflow_id}" if workflow_id else "global_knowledge"
    return await retriever.query(question, collection_name)
