import google.generativeai as genai
from app.config import settings
from app.rag.embeddings import EmbeddingGenerator
from app.rag.vectorstore import VectorStore
from app.core.logging import get_logger

logger = get_logger(__name__)

class RAGRetriever:
    def __init__(self):
        self.embedding_gen = EmbeddingGenerator()
        self.vector_store = VectorStore()
        if settings.GEMINI_API_KEY:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            self.model = genai.GenerativeModel('gemini-2.5-flash')
        else:
            self.model = None

    async def query(self, question: str, collection_name: str) -> dict:
        try:
            # 1. Embed query
            query_embedding = await self.embedding_gen.generate([question])
            
            # 2. Search ChromaDB
            results = await self.vector_store.search(
                collection_name=collection_name,
                query_texts=[question] if not query_embedding[0] else None,
                query_embeddings=query_embedding if query_embedding[0] else None,
                n_results=10
            )
            
            documents = results.get("documents", [[]])[0]
            metadatas = results.get("metadatas", [[]])[0]
            
            if not documents:
                return {
                    "answer": "I don't have enough context in the collected data to answer that question.",
                    "sources": [],
                    "confidence": 0.0
                }
                
            # 3. Construct prompt
            context = "\n\n".join([f"Source [{i+1}] ({metadatas[i].get('source', 'unknown')}): {doc}" for i, doc in enumerate(documents)])
            
            prompt = f"""
            You are an AI assistant analyzing market research data.
            Use ONLY the following context to answer the user's question. If the answer is not contained in the context, say so.
            Always cite your sources using the [number] format.
            
            Context:
            {context}
            
            Question: {question}
            """
            
            # 4. Generate answer
            if self.model:
                response = await self.model.generate_content_async(prompt)
                answer = response.text
            else:
                answer = "Mock AI Response: Without an API key, I can only retrieve the relevant context. Here are the most relevant documents found:\n\n" + context
                
            # Format sources
            sources = [{"id": i+1, "text": doc[:100] + "...", "metadata": meta} for i, (doc, meta) in enumerate(zip(documents, metadatas))]
            
            return {
                "answer": answer,
                "sources": sources,
                "confidence": 0.85 # Mock confidence
            }
            
        except Exception as e:
            logger.error(f"Error in RAG query: {e}")
            return {
                "answer": f"An error occurred while processing your request: {str(e)}",
                "sources": [],
                "confidence": 0.0
            }
