"""
Per-workflow vector index for Ask AI.

Postgres is the source of truth. A workflow's collection (wf_<id>) is a cache
that can be rebuilt from its ScrapedData rows at any time: ensure_workflow_index()
compares the collection with the chunk plan built from Postgres and embeds only
what is missing. A wiped disk (a Render restart), an index left half-built by a
rate limit, and a workflow that finished before Ask AI existed are all the same
case, so none of them needs a migration.
"""

import asyncio
import re
import time
from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.logging import get_logger
from app.database import async_session_factory
from app.models.scraped_data import ScrapedData
from app.models.workflow import Workflow
from app.rag.embeddings import EmbeddingGenerator, failure_reason
from app.rag.provenance import is_simulated, mock_fingerprints
from app.rag.vectorstore import VectorStore, workflow_collection_name

logger = get_logger(__name__)

# One comment is one chunk. Longer text (articles) is split into windows of
# about CHUNK_CHARS with CHUNK_OVERLAP of shared context, cut at a space, so a
# citation can always show the whole chunk the model read.
CHUNK_CHARS = 600
CHUNK_OVERLAP = 100
MIN_CHUNK_CHARS = 15

_YOUTUBE_ID = re.compile(r"^[A-Za-z0-9_-]{6,20}$")


@dataclass(frozen=True)
class Chunk:
    id: str  # "<scraped_data_id>:<n>"
    text: str
    scraped_data_id: str
    source: str
    sentiment_label: str | None
    sentiment_score: float | None
    simulated: bool
    url: str | None

    def metadata(self) -> dict:
        # Chroma metadata values must be str/int/float/bool, so None is left out.
        meta = {
            "scraped_data_id": self.scraped_data_id,
            "source": self.source,
            "simulated": self.simulated,
            "sentiment_label": self.sentiment_label,
            "sentiment_score": self.sentiment_score,
            "url": self.url,
        }
        return {k: v for k, v in meta.items() if v is not None}


@dataclass
class IndexPlan:
    """Everything Ask AI needs to know about one workflow's data, from Postgres."""

    workflow_id: UUID
    collection: str
    chunks: list[Chunk]
    item_count: int  # rows that contributed at least one chunk
    simulated_items: int
    total_rows: int
    source_counts: dict[str, int] = field(default_factory=dict)
    sentiment_counts: dict[str, int] = field(default_factory=dict)

    @property
    def simulated_share(self) -> float:
        return round(self.simulated_items / self.item_count, 3) if self.item_count else 0.0


def split_text(text: str) -> list[str]:
    """Split text into overlapping windows. Every piece is a verbatim substring."""
    text = text.strip()
    if len(text) < MIN_CHUNK_CHARS:
        return []
    if len(text) <= CHUNK_CHARS:
        return [text]

    pieces: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_CHARS, len(text))
        if end < len(text):
            # Prefer to cut at a space within the last CHUNK_OVERLAP characters.
            cut = text.rfind(" ", start + CHUNK_CHARS - CHUNK_OVERLAP, end)
            if cut > start:
                end = cut
        piece = text[start:end].strip()
        if len(piece) >= MIN_CHUNK_CHARS:
            pieces.append(piece)
        if end >= len(text):
            break
        next_start = end - CHUNK_OVERLAP
        space = text.find(" ", next_start, end)
        start = space + 1 if space != -1 else next_start
    return pieces


def _source_url(metadata: dict | None, simulated: bool) -> str | None:
    # Mock records carry invented URLs (random HN ids, example.com), so a
    # simulated row never gets a link.
    if simulated or not isinstance(metadata, dict):
        return None
    url = metadata.get("url")
    video_id = metadata.get("video_id")
    if not url and isinstance(video_id, str) and _YOUTUBE_ID.match(video_id):
        url = f"https://www.youtube.com/watch?v={video_id}"
    if isinstance(url, str) and url.startswith(("https://", "http://")) and len(url) <= 500:
        return url
    return None


def build_plan(workflow_id: UUID, query: str, rows) -> IndexPlan:
    """Turn a workflow's ScrapedData rows into a deterministic, capped chunk plan.

    ``rows`` have id, source, content, sentiment_label, sentiment_score and
    metadata_. Sources take turns (round-robin) until ASK_AI_MAX_CHUNKS, so a
    cap never drops a whole source.
    """
    fingerprints = mock_fingerprints(query)
    source_counts: dict[str, int] = {}
    sentiment_counts: dict[str, int] = {}
    per_source: dict[str, list[list[Chunk]]] = {}

    for row in sorted(rows, key=lambda r: str(r.id)):
        source = row.source or "unknown"
        content = row.content or ""
        source_counts[source] = source_counts.get(source, 0) + 1
        label = (row.sentiment_label or "").upper() or None
        if label:
            sentiment_counts[label] = sentiment_counts.get(label, 0) + 1

        simulated = is_simulated(source, content, fingerprints)
        url = _source_url(row.metadata_, simulated)
        row_id = str(row.id)
        chunks = [
            Chunk(
                id=f"{row_id}:{n}",
                text=piece,
                scraped_data_id=row_id,
                source=source,
                sentiment_label=label,
                sentiment_score=row.sentiment_score,
                simulated=simulated,
                url=url,
            )
            for n, piece in enumerate(split_text(content))
        ]
        if chunks:
            per_source.setdefault(source, []).append(chunks)

    selected: list[Chunk] = []
    queues = [per_source[s] for s in sorted(per_source)]
    cap = settings.ASK_AI_MAX_CHUNKS
    while len(selected) < cap and any(queues):
        for queue in queues:
            if queue and len(selected) < cap:
                selected.extend(queue.pop(0)[: cap - len(selected)])

    simulated_by_row = {c.scraped_data_id: c.simulated for c in selected}
    return IndexPlan(
        workflow_id=workflow_id,
        collection=workflow_collection_name(workflow_id),
        chunks=selected,
        item_count=len(simulated_by_row),
        simulated_items=sum(simulated_by_row.values()),
        total_rows=len(rows),
        source_counts=source_counts,
        sentiment_counts=sentiment_counts,
    )


async def load_plan(db: AsyncSession, workflow: Workflow) -> IndexPlan:
    result = await db.execute(
        select(
            ScrapedData.id,
            ScrapedData.source,
            ScrapedData.content,
            ScrapedData.sentiment_label,
            ScrapedData.sentiment_score,
            ScrapedData.metadata_,
        ).where(ScrapedData.workflow_id == workflow.id)
    )
    return build_plan(workflow.id, workflow.query, result.all())


# One rebuild per workflow at a time (per process). Deleting a collection takes
# the same lock, so it waits for an indexing run to finish first.
_locks: dict[str, asyncio.Lock] = {}


def _lock_for(workflow_id: UUID) -> asyncio.Lock:
    return _locks.setdefault(str(workflow_id), asyncio.Lock())


async def ensure_workflow_index(plan: IndexPlan) -> int:
    """Make the collection match the plan. Returns how many chunks were embedded.

    Raises EmbeddingError or a Chroma error if it can't; progress made before
    the failure is kept (each batch is stored as soon as it is embedded).
    """
    store = VectorStore()
    async with _lock_for(plan.workflow_id):
        collection = await asyncio.to_thread(store.open_collection, plan.collection)
        existing = set((await asyncio.to_thread(collection.get, include=[]))["ids"])
        wanted = {chunk.id for chunk in plan.chunks}

        stale = sorted(existing - wanted)
        if stale:
            await asyncio.to_thread(collection.delete, ids=stale)

        missing = [chunk for chunk in plan.chunks if chunk.id not in existing]
        embedder = EmbeddingGenerator()
        size = settings.EMBEDDING_BATCH_SIZE
        for start in range(0, len(missing), size):
            batch = missing[start:start + size]
            vectors = await embedder.embed_strict([c.text for c in batch], "retrieval_document")
            await asyncio.to_thread(
                collection.upsert,
                ids=[c.id for c in batch],
                embeddings=vectors,
                documents=[c.text for c in batch],
                metadatas=[c.metadata() for c in batch],
            )
        return len(missing)


# One build task per workflow, shared by the completion hook and every question
# about that workflow, so a question asked mid-build waits on the same work.
_builds: dict[str, asyncio.Task] = {}


def _forget_build(key: str, task: asyncio.Task) -> None:
    if _builds.get(key) is task:
        del _builds[key]
    if not task.cancelled() and task.exception() is not None:
        logger.warning("ask_ai_index_build_failed", workflow_id=key, **failure_reason(task.exception()))


def start_index_build(plan: IndexPlan) -> asyncio.Task:
    key = str(plan.workflow_id)
    task = _builds.get(key)
    if task is None or task.done():
        task = asyncio.get_running_loop().create_task(ensure_workflow_index(plan))
        _builds[key] = task
        task.add_done_callback(lambda done, key=key: _forget_build(key, done))
    return task


def is_building(workflow_id: UUID) -> bool:
    task = _builds.get(str(workflow_id))
    return task is not None and not task.done()


async def wait_for_index(plan: IndexPlan, timeout: float) -> bool:
    """True once the collection matches the plan; False if it is still being
    built after ``timeout`` seconds (the build continues in the background).
    Raises the build's error if it failed."""
    try:
        await asyncio.wait_for(asyncio.shield(start_index_build(plan)), timeout)
        return True
    except asyncio.TimeoutError:
        return False


def collection_count(collection_name: str) -> int | None:
    """Chunks stored for a collection, or None if it doesn't exist. Blocking."""
    collection = VectorStore().find_collection(collection_name)
    return None if collection is None else collection.count()


# ── Background work (best effort, never raises) ──────────────

# Strong references so pending tasks aren't garbage-collected mid-run.
_background: set[asyncio.Task] = set()


def _spawn(coro, event: str, workflow_id: UUID) -> None:
    try:
        task = asyncio.get_running_loop().create_task(coro)
        _background.add(task)
        task.add_done_callback(_background.discard)
    except Exception as e:
        coro.close()
        logger.warning(event, workflow_id=str(workflow_id), error=type(e).__name__)


async def index_workflow(workflow_id: UUID) -> None:
    """Index one workflow from Postgres. Logs and swallows every error.

    Reads the workflow and its rows in a short session of its own and never
    writes to the workflows table, so it cannot change a run's status.
    """
    started = time.perf_counter()
    try:
        async with async_session_factory() as db:
            workflow = await db.get(Workflow, workflow_id)
            if workflow is None:
                return
            plan = await load_plan(db, workflow)
        embedded = await start_index_build(plan)
        logger.info(
            "ask_ai_indexed",
            workflow_id=str(workflow_id),
            chunks=len(plan.chunks),
            embedded=embedded,
            ms=round((time.perf_counter() - started) * 1000),
        )
    except Exception as e:
        logger.warning(
            "ask_ai_index_failed",
            workflow_id=str(workflow_id),
            error=type(e).__name__,
            ms=round((time.perf_counter() - started) * 1000),
        )


def schedule_workflow_index(workflow_id: UUID) -> None:
    """Start indexing a finished workflow in the background and return at once."""
    _spawn(index_workflow(workflow_id), "ask_ai_index_not_scheduled", workflow_id)


async def delete_workflow_index(workflow_id: UUID) -> None:
    try:
        name = workflow_collection_name(workflow_id)
        async with _lock_for(workflow_id):
            await asyncio.to_thread(VectorStore().drop_collection, name)
        _locks.pop(str(workflow_id), None)
    except Exception as e:
        logger.warning("ask_ai_index_delete_failed", workflow_id=str(workflow_id), error=type(e).__name__)


def schedule_index_delete(workflow_id: UUID) -> None:
    """Drop a deleted workflow's collection in the background. Never raises."""
    _spawn(delete_workflow_index(workflow_id), "ask_ai_index_delete_not_scheduled", workflow_id)
