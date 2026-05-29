import chromadb
from chromadb.config import Settings
import asyncio
from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

class VectorStore:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(VectorStore, cls).__new__(cls)
            try:
                # Initialize ChromaDB client
                cls._instance.client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
                logger.info("ChromaDB client initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize ChromaDB client: {e}")
                cls._instance.client = None
        return cls._instance
        
    def _get_or_create_collection(self, collection_name: str):
        if self.client is None:
            return None
        return self.client.get_or_create_collection(name=collection_name)

    async def add_documents(self, collection_name: str, texts: list[str], metadatas: list[dict], ids: list[str], embeddings: list[list[float]] = None):
        collection = self._get_or_create_collection(collection_name)
        if collection is None:
            logger.warning("ChromaDB not available, skipping add_documents")
            return False
            
        try:
            await asyncio.to_thread(
                collection.upsert,
                documents=texts,
                metadatas=metadatas,
                ids=ids,
                embeddings=embeddings
            )
            return True
        except Exception as e:
            logger.error(f"Error adding documents to ChromaDB: {e}")
            return False

    async def search(self, collection_name: str, query_texts: list[str], query_embeddings: list[list[float]] = None, n_results: int = 5) -> dict:
        collection = self._get_or_create_collection(collection_name)
        if collection is None:
            logger.warning("ChromaDB not available, returning empty search results")
            return {"documents": [], "metadatas": [], "distances": []}
            
        try:
            results = await asyncio.to_thread(
                collection.query,
                query_texts=query_texts if not query_embeddings else None,
                query_embeddings=query_embeddings,
                n_results=n_results
            )
            return results
        except Exception as e:
            logger.error(f"Error searching ChromaDB: {e}")
            return {"documents": [], "metadatas": [], "distances": []}
            
    async def delete_collection(self, collection_name: str):
        if self.client is None:
            return False
        try:
            await asyncio.to_thread(self.client.delete_collection, collection_name)
            return True
        except Exception as e:
            logger.error(f"Error deleting collection {collection_name}: {e}")
            return False
