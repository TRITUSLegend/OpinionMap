import re
from uuid import UUID

import chromadb
from chromadb.config import Settings
import asyncio
from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Every collection uses cosine distance (1 - cosine similarity, 0..2). Chroma's
# default is L2, which the Ask AI similarity threshold doesn't understand.
COSINE = {"hnsw:space": "cosine"}

# Chroma's naming rules: 3-512 characters from [a-zA-Z0-9._-], starting and
# ending with a letter or digit, no "..", and not an IPv4 address.
_VALID_NAME = re.compile(r"^[a-zA-Z0-9](?!.*\.\.)[a-zA-Z0-9._-]{1,510}[a-zA-Z0-9]$")


def workflow_collection_name(workflow_id: UUID) -> str:
    """The collection holding one workflow's chunks: ``wf_<uuid>``.

    Only ever built from a UUID the server has already verified, never from a
    name the client sent.
    """
    name = f"wf_{UUID(str(workflow_id))}"
    if not _VALID_NAME.match(name):
        raise ValueError(f"invalid collection name: {name}")
    return name


def _create_client():
    """HTTP client for the Chroma server when CHROMA_HOST is set, else local disk.

    A configured server that can't be reached falls back to the local client,
    so a wrong host never takes the app down; the fallback is logged.
    """
    if settings.CHROMA_HOST:
        try:
            client = chromadb.HttpClient(host=settings.CHROMA_HOST, port=settings.CHROMA_PORT)
            client.heartbeat()
            logger.info("ChromaDB HTTP client connected", host=settings.CHROMA_HOST, port=settings.CHROMA_PORT)
            return client
        except Exception as e:
            logger.warning(
                "ChromaDB server unreachable, falling back to the local persistent store",
                host=settings.CHROMA_HOST,
                port=settings.CHROMA_PORT,
                error=str(e),
            )
    client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
    logger.info("ChromaDB persistent client initialized", path=settings.CHROMA_PERSIST_DIR)
    return client


class VectorStore:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(VectorStore, cls).__new__(cls)
            try:
                cls._instance.client = _create_client()
            except Exception as e:
                logger.error(f"Failed to initialize ChromaDB client: {e}")
                cls._instance.client = None
        return cls._instance

    def _get_or_create_collection(self, collection_name: str):
        if self.client is None:
            return None
        return self.client.get_or_create_collection(name=collection_name, metadata=COSINE)

    async def add_documents(self, collection_name: str, texts: list[str], metadatas: list[dict], ids: list[str], embeddings: list[list[float]] = None):
        if self.client is None:
            logger.warning("ChromaDB not available, skipping add_documents")
            return False

        try:
            collection = await asyncio.to_thread(self._get_or_create_collection, collection_name)
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
        if self.client is None:
            logger.warning("ChromaDB not available, returning empty search results")
            return {"documents": [], "metadatas": [], "distances": []}

        try:
            collection = await asyncio.to_thread(self._get_or_create_collection, collection_name)
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

    # ── Synchronous helpers for Ask AI ──────────────────────────
    # Blocking (disk or network). Callers run them with asyncio.to_thread.

    def require_client(self):
        if self.client is None:
            raise RuntimeError("ChromaDB is not available")
        return self.client

    def open_collection(self, collection_name: str):
        """Get or create a cosine collection; a non-cosine one is recreated."""
        client = self.require_client()
        collection = client.get_or_create_collection(name=collection_name, metadata=COSINE)
        if (collection.metadata or {}).get("hnsw:space") != "cosine":
            client.delete_collection(collection_name)
            collection = client.create_collection(name=collection_name, metadata=COSINE)
        return collection

    def find_collection(self, collection_name: str):
        """The collection, or None if it doesn't exist."""
        client = self.require_client()
        try:
            return client.get_collection(collection_name)
        except Exception:
            return None

    def drop_collection(self, collection_name: str) -> bool:
        """Delete a collection; False if it didn't exist."""
        client = self.require_client()
        try:
            client.delete_collection(collection_name)
            return True
        except Exception:
            return False
