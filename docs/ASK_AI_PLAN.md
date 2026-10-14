# Ask AI: plan, findings and decisions

Per-workflow question answering over the comments a workflow collected, with
citations to the exact source comments. This file records what the old RAG
module actually did, the design chosen, and every decision that could have gone
either way. Section 6 holds the verification results.

## 1. Findings: the existing RAG module (Phase 1)

Tested locally on 2026-10-14 with the real `.env` Gemini key, chromadb 1.5.9 and
google-generativeai 0.8.6 (Python 3.11 venv).

| # | Finding | Where |
|---|---------|-------|
| F1 | **The embedding model no longer exists.** `models/text-embedding-004` returns `404 ... not found for API version v1beta`. `ListModels` for this key offers `gemini-embedding-001`, `gemini-embedding-2-preview`, `gemini-embedding-2`. | `backend/app/rag/embeddings.py:44` |
| F2 | **The failure is silent.** The 404 is caught and the module falls back to hashed character 3-grams. Those vectors are not semantic, so every query "works" but retrieves by spelling overlap. | `embeddings.py:54-57`, `:59-78` |
| F3 | `gemini-embedding-001` works with this SDK: batches of 20 and 50 succeed (~2 s), `output_dimensionality=768` is honoured, and `task_type` `retrieval_document` / `retrieval_query` are accepted. A batch of 100 hit a `429 ResourceExhausted` on the free tier, so batches must be smaller and retried with backoff. | probe scripts (not committed) |
| F4 | **The Chroma client is local only.** `chromadb.PersistentClient(CHROMA_PERSIST_DIR)`. `CHROMA_HOST`/`CHROMA_PORT` are declared in config (default `localhost`) but never read, so the `chromadb` container in Compose runs unused. | `vectorstore.py:17`, `config.py:71-75`, `docker-compose.yml:47-48, 85-95` |
| F5 | Collections are created with Chroma's default **L2** distance, not cosine. | `vectorstore.py:27` |
| F6 | `upsert`/`query` run in `asyncio.to_thread`, but `get_or_create_collection` runs **on the event loop**. With an HTTP client that is a blocking network call. Every Chroma call and every Gemini embedding call is synchronous, so all of them must go through a worker thread. | `vectorstore.py:24-64` |
| F7 | `POST /api/rag/index` is a **no-op** that always returns "Documents indexed successfully". Nothing ever writes to the collections `/api/rag/query` reads (`workflow_<id>`), so `/query` always answered "I don't have enough context". | `api/rag.py:23-30`, `services/rag_service.py:5` |
| F8 | `POST /api/rag/query` has **no ownership check** (the code says so in a comment) and accepts any string as a collection suffix. Harmless today only because F7 means every collection is empty. | `api/rag.py:14-21` |
| F9 | The retriever passes `query_texts` when an embedding is falsy, which would make Chroma download its default ONNX embedding model at request time. It also returns `str(e)` to the client on errors. | `retriever.py:27, 72-78` |
| F10 | Both clients were exercised directly: `PersistentClient` and `HttpClient` (against a local `chroma run` server standing in for the container) create cosine collections via `metadata={"hnsw:space": "cosine"}`, return distances in `[0, 2]` (cosine distance = 1 - similarity), raise `NotFoundError` for a missing collection, and delete cleanly. | probe scripts |

**Verdict:** the old path never worked as RAG. It produced answers, but from
non-semantic vectors over collections nothing populated.

### Mock and simulated rows

`ScrapedData` has no flag for generated data (`models/scraped_data.py:25-57`),
and every scraper's mock records use exactly the same metadata keys as its live
records (e.g. `scrapers/hackernews.py:67-93` vs `:141-153`). So the brief's
fallback applies in principle. But a closer look gives a reliable signal without
touching any scraper:

- `twitter` is always simulated (`scrapers/twitter.py:1-15`).
- Every other scraper's mock content is **purely template text**:
  `template.format(query=...)` or `template.format(product=query.title())`, and
  for news/Guardian a fixed body around a templated headline. The only random
  parts (author, date, URL, ids) live in metadata, not in the content.
- The pipeline stores `clean_text(content)` (`agents/cleaning_agent.py:8-17`).

So for a workflow with query `q`, the full set of texts a mock generator could
have produced is finite and can be rebuilt from the scrapers' own template lists.
`rag/provenance.py` does that (read-only imports, nothing in `scrapers/`
changes) and flags a row `simulated: true` when its content is in that set.

Limits, stated honestly: `simulated: false` means "not recognised as generated",
not "verified real". If a template is edited later, older workflows built from
the old wording are no longer recognised. Mock URLs are fake (random HN item ids,
`example.com`, invented Guardian slugs), so **no URL is ever returned for a
simulated row**.

## 2. Design

### 2.1 Vector store (`backend/app/rag/`, extended)

- **Client selection** (`vectorstore.py`): if `CHROMA_HOST` is non-empty, use
  `chromadb.HttpClient(CHROMA_HOST, CHROMA_PORT)` and check its heartbeat. If that
  fails, log a warning and fall back to the local `PersistentClient`. If
  `CHROMA_HOST` is empty (the new default), use `PersistentClient` directly.
  Compose sets `CHROMA_HOST=chromadb`, so the container is finally used; Render
  and plain local dev leave it empty.
- **One collection per workflow**: `wf_<workflow uuid>` (39 chars, matches
  Chroma's `[a-zA-Z0-9._-]`, 3-512 chars, alphanumeric at both ends; validated
  by regex). Built only from a server-verified `UUID`, never from client input.
  Cosine space.
- **Postgres is the source of truth.** `ensure_workflow_index()` loads the
  workflow's `ScrapedData`, builds the deterministic chunk plan, compares it with
  the ids already in the collection, deletes stale ids and embeds only the missing
  ones. A wiped disk, a half-finished index after a 429, or a workflow that
  finished before this feature existed (backfill) are all the same case and need
  no migration. A per-workflow `asyncio.Lock` stops two requests from rebuilding
  the same collection at once.
- **Chunking**: one comment = one chunk. Text over 600 characters is split into
  ~600-character windows with ~100 characters of overlap, cut at a space. Text
  under 15 characters is skipped. At most 400 chunks per workflow
  (`ASK_AI_MAX_CHUNKS`), taken round-robin across sources so a cap never drops a
  whole source.
  *Decision:* the brief suggested ~800 characters. 600 was chosen so a citation
  can always show the full chunk the model saw while staying within the ~600
  character citation limit.
- **Chunk id** `<scraped_data_id>:<n>`; metadata `scraped_data_id`, `source`,
  `sentiment_label`, `sentiment_score`, `simulated`, and `url` (only for
  non-simulated rows with an http(s) URL).
- **Embeddings** (`embeddings.py`): model from config (`EMBEDDING_MODEL`,
  default `models/gemini-embedding-001`) at `EMBEDDING_DIM=768`, so stored vectors
  keep the old 768 size. New `embed_strict()` batches 50 texts per call
  (`EMBEDDING_BATCH_SIZE`), uses `retrieval_document` / `retrieval_query`, retries
  rate limits with `core/retry.py`'s `gemini_backoff`, and **raises** instead of
  falling back. Ask AI never uses the n-gram fallback: those vectors would make the
  similarity threshold meaningless. The legacy `generate()` keeps its fallback.
- **Threading**: every Chroma call and every embedding call runs in
  `asyncio.to_thread` (the existing module's convention).

### 2.2 Index on completion (best effort)

`workers/tasks.py` gets one call after the final commit:
`schedule_workflow_index(workflow_id)` when the final status is `completed` or
`auto_approved`. It starts an `asyncio` task (reference held so it isn't garbage
collected) and returns at once. The task opens its own DB session, never writes to
the `workflows` table, and catches and logs every exception. Scheduling itself
sits inside its own try/except, so nothing it does can reach the pipeline's
`except` block that marks a run `failed`.

### 2.3 Endpoints (additive)

New router `api/ask.py`, mounted on the existing `/api/workflows` prefix:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/workflows/{id}/ask/status` | `{indexed, chunk_count, simulated_share, item_count, workflow_status, query}`. Cheap: one DB read and one Chroma read, no embedding. |
| POST | `/api/workflows/{id}/ask` | Ask one question. |

Both require auth and ownership (404 for a missing or someone else's workflow,
the same pattern as `api/workflows.py:61-63`).

**Ask flow**: per-user rate limit (10/min, 429) -> body validation (question
1-500 chars, 422) -> injection screen and `sanitize_query` (400 / 422) ->
ownership (404) -> status must be `completed`/`auto_approved` (409) ->
`ensure_workflow_index` -> embed the retrieval query -> top-k (8) by cosine ->
**not-covered gate** (no results, or best similarity below
`ASK_AI_MIN_SIMILARITY`: fixed answer, **no LLM call**) -> one Gemini call
(`gemini-2.5-flash`, JSON mode, temperature 0.2) -> server-side validation ->
response.

- **Retrieval query with history**: the latest question plus the last user turn,
  concatenated (no extra LLM call). Up to two earlier user questions also go into
  the prompt, labelled as context, not evidence. Assistant turns sent by the client
  are never put in the prompt: the client could put anything in them.
- **Prompt**: excerpts numbered `[1]..[k]` inside `<excerpts>` delimiters, the
  question inside `<question>`, and an explicit rule that both are data, not
  instructions. Before insertion, `<`, `>`, `[` and `]` in excerpt text and in the
  question are replaced, so a scraped comment cannot close a delimiter or forge a
  citation marker.
- **Workflow stats block**: per-source counts and the sentiment split, computed
  from the same `ScrapedData` rows (about 20 lines). The model may use it only for
  counting or percentage questions; the prompt says the excerpts are top matches,
  not a full count.
- **Validation**: `extract_json()`; an unknown `status` becomes `partial`; cited ids
  outside the retrieved set are dropped; `[n]` markers pointing to invalid ids are
  removed from the text; if no valid citation remains and the status is not
  `not_covered`, the answer is **replaced** with the fixed not-covered message.
  Citation text comes from the chunk built from Postgres, never from the model.
- **Errors**: no key, embedding failure, Gemini failure, or unparseable output
  return `503 {"detail": "<friendly message>"}`. Never a stack trace.
- **Logging**: structlog event `ask_ai_answered` with `workflow_id`, `embed_ms`,
  `index_ms`, `retrieve_ms`, `generate_ms`, `best_similarity`, `retrieved`,
  `status`. No comment text is logged.

### 2.4 Rate limit

`core/rate_limit.py`: an in-memory sliding window per user
(`ASK_AI_RATE_LIMIT_PER_MINUTE=10`). It is per process: it resets on restart and
is not shared between workers, which is fine for one Render instance and is listed
as a weak spot.

### 2.5 Cleanup

`DELETE /api/workflows/{id}` schedules a best-effort collection delete after the
rows are gone (it takes the same per-workflow lock, so it waits for an indexing
run to finish). The response and status codes are unchanged.

### 2.6 Legacy `/api/rag/*`

Kept, with the same request and response shapes, but with the broken parts fixed:

- F1/F2: they share `EmbeddingGenerator`, so the model fix applies.
- F8: `/rag/query` now returns 404 for a workflow that isn't the caller's (or
  isn't a UUID), and reads the real `wf_<id>` collection.
- F7: `/rag/index` now really schedules indexing for an owned workflow (same 404
  rule), and still returns `{"status": "success", "message": ...}`.
- F5: collections created through the legacy path are cosine too, so it can never
  create an L2 collection under a name Ask AI uses.
- F9 is left alone (out of scope). The legacy path is superseded by Ask AI.

### 2.7 Frontend

- `frontend/src/features/ask-ai/` (new convention; the closest existing one,
  `landing/`, is also a self-contained lazy folder), lazy-loaded from one new route
  `/workflows/:workflowId/ask` inside the protected layout. `App.tsx` gets one
  `lazy()` line and one `<Route>`.
- **Entry points**: an "Ask AI" action in each Workflows row (shown but
  `aria-disabled`, with a tooltip, until the run completes) and an "Ask AI" button
  on each report card (the app has no report detail view; the card is the closest).
- **Layout**: the chat is a full-height column with its own scrolling message
  list, so the window does not scroll and the scroll-to-top button never appears
  over the composer. While the storage notice is showing, the column leaves room
  for it (CSS `:has()`, so no shared component changes).
- Plain-text rendering only; `[n]` markers become buttons that highlight the
  matching source card. No `dangerouslySetInnerHTML`.
- API helpers go in `api/client.ts` (additive), with a 60 s timeout for `ask`.

## 3. Config added (`backend/app/config.py`, `.env.example`)

| Setting | Default | Notes |
|---|---|---|
| `CHROMA_HOST` | `""` (was `localhost`, unused) | Non-empty: use the Chroma server. Compose sets `chromadb`. |
| `EMBEDDING_MODEL` | `models/gemini-embedding-001` | F1 fix |
| `EMBEDDING_DIM` | `768` | Matches the old vector size |
| `EMBEDDING_BATCH_SIZE` | `50` | F3 |
| `ASK_AI_TOP_K` | `8` | |
| `ASK_AI_MIN_SIMILARITY` | see 4 | not-covered gate |
| `ASK_AI_MAX_CHUNKS` | `400` | protects the free-tier embedding quota |
| `ASK_AI_RATE_LIMIT_PER_MINUTE` | `10` | |

## 4. Similarity threshold calibration

_Filled in from the real-data run in Phase 4 (section 6)._

## 5. Decisions log (could have gone either way)

1. **Branch base**: `feat/ask-ai` starts from `origin/main` (local `main` was 20
   commits behind). The unpushed `feat/dashboard-first-run` stays its own branch.
2. **Detecting simulated rows** by rebuilding template text, rather than marking
   only `twitter` and calling the rest "unknown". It needs no scraper change and
   catches the common case (no API key, so every source falls back to templates).
3. **404, not 403, for someone else's workflow**, the existing convention, so ids
   can't be probed.
4. **An injection-pattern question is refused (400)** with a question-specific
   message, before any retrieval or LLM call. `sanitize_query`'s detection loop
   moved into a helper, `find_injection_pattern()`, that it still calls, so its
   behaviour and messages are unchanged for workflow creation.
5. **History is capped, not rejected**: more than 6 turns are trimmed to the
   last 6, and each turn is truncated to 1,000 characters.
6. **Answered without a valid citation becomes `not_covered`**, with the fixed
   message, rather than `partial`. Showing uncited model text as a partial answer
   would defeat the point of the feature.
7. **Status endpoint for a running workflow returns 200** with
   `workflow_status`, so the page can show a calm "still running" state. Only `ask`
   returns 409.

## 6. Verification results

_Filled in during Phase 4._
