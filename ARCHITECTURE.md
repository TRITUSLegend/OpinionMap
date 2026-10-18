# OpinionMap — Architecture & Technical Reference

## Overview

OpinionMap is a multi-agent market intelligence platform. A user submits a research query
("iPhone 17 battery life user sentiment"), and a six-node LangGraph pipeline handles it:

1. It scrapes seven data sources. Twitter/X is always simulated, and every other source can fall
   back to template data.
2. It cleans and de-duplicates the text.
3. It runs rule-based sentiment, topic, keyword and trend heuristics over it.
4. It asks Google Gemini for structured insights.
5. It drafts a report.
6. It passes that report through a deterministic quality gate before persisting it.

The core technical approach is a **stateful agent graph**: every node receives and returns the same
`AgentState` TypedDict. Each agent can therefore be tested in isolation, although none has a test
yet. The orchestration logic lives in one place (`graph.py`) rather than being scattered across
service code. The reviewer node closes a
conditional loop back to the report node, giving the pipeline a bounded self-correction cycle.

**Ask AI** sits *after* the pipeline, not inside it. When a run completes, its stored comments are
chunked, embedded with Gemini and written to a per-workflow ChromaDB collection (`wf_<workflow id>`).
`POST /api/workflows/{id}/ask` retrieves the closest chunks, refuses without calling the LLM when
nothing is close enough, and otherwise makes one Gemini call whose citations are validated
server-side. Postgres stays the source of truth: a missing or partial collection is rebuilt from
`scraped_data` on demand. No tables or columns were added.

---

## System Architecture

### Infrastructure (Docker Compose)

Seven services. (An eighth, `mlflow`, was removed in an earlier cleanup pass — its Dockerfile and
compose entry are both gone.)

| Service | Container | Purpose | Port |
|---|---|---|---|
| `nginx` | `agentflow-nginx` | TLS termination, reverse proxy, per-IP rate limits and security headers. Needs `nginx/ssl/fullchain.pem` and `privkey.pem`, which are gitignored and generated per deployment | `80:80`, `443:443` |
| `frontend` | `agentflow-frontend` | React SPA built by Vite, served by its own nginx | internal only, proxied |
| `backend` | `agentflow-backend` | FastAPI application, the agent pipeline, all business logic | `8000:8000` |
| `postgres` | `agentflow-postgres` | Primary relational store (postgres:16-alpine). Needs `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` in `.env`; the health check hardcodes user and database `agentflow` | internal only, `5432` |
| `chromadb` | `agentflow-chromadb` | Ask AI vector store (`chromadb/chroma:latest`). The backend connects via `CHROMA_HOST=chromadb` and falls back to its own disk, with a log line, if unreachable | internal only, `8000` |
| `prometheus` | `agentflow-prometheus` | Configured to scrape `/api/monitoring/metrics`, which returns 404; the app serves `/metrics` (see Known Issues) | `9090:9090` |
| `grafana` | `agentflow-grafana` | Mounts `monitoring/grafana` as its provisioning folder. The bundled dashboard queries metrics the app does not export (see Known Issues) | `3000:3000` |

The backend (`8000`), Prometheus (`9090`) and Grafana (`3000`) also publish host ports, so nginx
is not the only way in. The `agentflow-*` container, network and volume names are left over from the
project's previous name, "AgentFlow AI".

### Request Flow

**Synchronous read path**

```
Browser → nginx (443) → backend:8000 → FastAPI route → service layer → Postgres → JSON response
```

**Asynchronous workflow path**

```
Browser POST /api/workflows/
   → nginx → FastAPI create_workflow
   → sanitize_query() rejects prompt-injection patterns (HTTP 400) and truncates long input
   → Workflow row written with status="pending"
   → BackgroundTasks schedules execute_workflow_task
   → HTTP 200 returns immediately with the workflow id

(background)
   execute_workflow_task
      → run_workflow(query, sources, workflow_id)
      → LangGraph: research → cleaning → nlp_analysis → insights → report → reviewer
      → reviewer approves, or loops back to report (at most 3 report passes, i.e. 2 revisions)
      → ScrapedData / Analytics / AgentLog / Report rows written in one commit
        (nothing is persisted mid-run; a crash loses the run's data)
      → Workflow.status set to completed | auto_approved | failed
      → after that commit, if completed/auto_approved: an asyncio task embeds the run's comments
        into its Chroma collection (best effort; it never touches the workflow row)

(meanwhile)
   Workflows page polls GET /api/workflows/ every 15 s for as long as it is open
   (the Reports and Dashboard pages fetch once on mount and do not poll)
```

**Ask AI path**

```
Browser POST /api/workflows/{id}/ask {question, history}
   → FastAPI: bearer token (401) and body validation (422; question 1–500 chars, history cut to the last 6 turns)
   → per-user rate limit (10/min, 429; counted before the checks below)
   → injection screen (400), then sanitize_query (422 if too short afterwards)
   → ownership (404) → status must be completed or auto_approved (409)
   → load the workflow's ScrapedData, build the chunk plan (Postgres is the source of truth)
   → ensure the collection matches the plan (shared build task; 202 "preparing" after 25s)
   → embed question (+ previous user turn) → top-8 by cosine similarity
   → best similarity < 0.60: "not_covered", no LLM call
   → one Gemini call (JSON mode, numbered excerpts as delimited data)
   → validate: drop citations outside the retrieved set; uncited answer → "not_covered"
   → answer + citations whose text comes from the stored comments
```

### Tech Stack

| Layer | Technology | Purpose | Notes |
|---|---|---|---|
| Frontend | React 19.2 + TypeScript 6.0 | SPA | Vite 8 build, ESLint clean at 0 problems |
| Styling | Tailwind CSS 4 | Utility-first styling | via `@tailwindcss/vite`; CSS-variable design tokens, class-based dark mode |
| Charts | Recharts 3 | Sentiment visualisation | Dashboard chunk only |
| Animation | GSAP 3 | Count-up of dashboard headline numbers | Dashboard chunk only |
| Routing | react-router-dom 6 | Client-side routes | Landing, Dashboard and Ask AI are lazy-loaded chunks |
| HTTP | axios | API client | 30 s default timeout (90 s for login/register, 60 s for Ask AI), JWT interceptor, global 401 handler |
| API | FastAPI (unpinned in `requirements.txt`) | REST API, DI, OpenAPI schema | 29 documented paths, 33 operations; Docker image runs Python 3.11 |
| Orchestration | LangGraph | Six-node stateful agent graph | `graph.py` / `state.py` |
| LLM | Google Gemini `gemini-2.5-flash` | Insight + report generation, Ask AI answers | via `google-generativeai` (deprecated, see below) |
| ORM | SQLAlchemy 2 (async) | Data access | `asyncpg` in Docker, `aiosqlite` locally |
| DB | PostgreSQL 16 | Primary store | |
| Vectors | ChromaDB | Ask AI retrieval, one cosine collection per workflow | Gemini `gemini-embedding-001` at 768 dims (`text-embedding-004` was retired); HTTP client in Compose, on-disk elsewhere |
| Auth | python-jose + bcrypt | JWT issue/verify, password hashing | |
| Scraping | httpx, praw, google-api-python-client | Seven data sources | no per-vendor SDKs beyond these |
| Reports | reportlab, python-docx | PDF and DOCX export | |
| Observability | prometheus-client, structlog | Metrics and structured JSON logs | |
| Migrations | Alembic | Configured but unused — see Known Issues | schema managed by `create_all` |

---

## Agent Pipeline

### LangGraph Graph Structure

Six nodes wired as a linear chain with one conditional loop-back:

```
research → cleaning → nlp_analysis → insights → report → reviewer
                                                   ↑         │
                                                   └─────────┤ not approved
                                                             │
                                                            END  approved
```

`should_continue` reads `state["review_feedback"]["approved"]`. If true it routes to `END`;
otherwise it routes back to `report` for another drafting attempt. The reviewer increments
`state["revision_count"]` on every pass. On the third pass (the previous count was already 2) it
force-approves and sets `state["status"]` to `auto_approved`. The report node therefore runs at most
three times. That ceiling is what stops the loop from running forever when the report genuinely
cannot satisfy the quality checks.

The report node does not read `review_feedback`, so a revision re-runs the same prompt rather
than fixing the specific failure. The graph is compiled on every run (`run_workflow` in
`graph.py`).

**State keys read and written per node**

| Node | Reads | Writes |
|---|---|---|
| `research` | `query`, `sources` | `raw_data`, `errors`, `agent_logs` |
| `cleaning` | `raw_data` | `cleaned_data`, `agent_logs` |
| `nlp_analysis` | `cleaned_data` | `sentiment_results`, `topics`, `keywords`, `trends`, `agent_logs` |
| `insights` | `query`, `topics`, `keywords`, `trends` | `insights`, `competitor_analysis`, `pain_points`, `agent_logs` |
| `report` | `query`, `insights`, `competitor_analysis`, `pain_points`, `trends` (plus `sentiment_results` in the fallback) | `report`, `agent_logs` |
| `reviewer` | `report`, `revision_count` | `review_feedback`, `revision_count`, `status`, `agent_logs` |

Every node sets `current_agent`, and normally appends one entry to `agent_logs`. There are two
exceptions:

- `nlp_node` returns early, without a log entry, when `cleaned_data` is empty.
- Each revision loop adds another `report` and `reviewer` entry.

A run therefore produces six `agent_logs` rows normally, five if NLP was skipped, and more when
the reviewer loops. `tasks.py` keeps only the last status per agent name in
`Workflow.agent_states`.

### Agent Responsibilities

**research** — Fans out to whichever scrapers are named in `state["sources"]`.

- Each scraper is called with its default `max_results=50`.
- They run concurrently with `asyncio.gather(..., return_exceptions=True)`, so one failing source
  cannot abort the run.
- Each scraper returns `{source, content, metadata}` dicts, which are concatenated into `raw_data`.
- Exceptions are collected into `errors` rather than raised. `errors` is never persisted.
- Unknown source names are accepted by the API and silently ignored.

**cleaning** — Produces `cleaned_data` in four steps:

1. Strips URLs and special characters, keeping word characters, whitespace and `.,!?'"-`, then
   normalises whitespace.
2. Drops text under 10 characters.
3. Drops exact duplicates (by hash of the lowercased text) within the run.
4. Applies a simple English heuristic: keep the text if it contains at least one of 21 common
   English words, or has fewer than 5 words.

**nlp_analysis** — Runs four rule-based tools over the cleaned text. None of them uses an ML model.

- **`SentimentAnalyzer`:** `pipeline` is always `None`, so `_fallback_analyze` always runs. It
  counts 8 positive and 8 negative substrings and returns an uppercase label (`POSITIVE`,
  `NEGATIVE` or `NEUTRAL`) with a **constant** score: 0.8 for positive or negative, 0.5 for
  neutral. The score is not a polarity. The label and score are attached back onto each item.
- **`TopicExtractor`:** greedy keyword co-occurrence clusters, 5 topics.
- **`KeywordExtractor`:** `rake` is always `None`, so a word-frequency counter runs (words over 3
  characters minus a small stop-word list, top 20). Its `score` equals the frequency. There is
  **no per-keyword sentiment**.
- **`TrendAnalyzer`:** sorts items by `metadata.date` and returns `overall_positive_percentage`,
  `trend_direction` (`IMPROVING` / `DECLINING` / `STABLE`, from the positive ratio in the second
  half against the first, with a ±0.1 band) and `total_analyzed`.

`SentimentAnalyzer`, `TopicExtractor` and `TrendAnalyzer` are singletons.

**insights** — Builds a prompt from the query, topics, keywords and trends, and asks Gemini for
structured JSON (`response_mime_type: application/json`). The query passes through
`safe_query_for_prompt()` first. The prompt asks for `insights`, `competitor_analysis` (with
`top_competitors` as a **list of strings**) and `pain_points`. On any API failure it falls back to
a generic local summary with empty competitors and pain points, so the pipeline always produces
something downstream.

**report** — Asks Gemini for a full report: title, tagline, executive summary, recommendations,
12 named sections and "advanced metrics".

- The prompt tells the model to **use its own knowledge** of the topic.
- Pipeline context (insights, entities, concerns, trends) is added only when it doesn't look like
  fallback text. Raw comments never enter the prompt, so report content is not grounded in the
  collected data.
- If the call raises, a shorter "simple" prompt is tried once.
- If that also fails, or no `GEMINI_API_KEY` is set, `_fallback_report` builds a template titled
  `"<Query> (Basic Report - AI Quota Exceeded)"`. That title appears even when no key is configured.
- This is the node the reviewer can send work back to.

**reviewer** — A deterministic local validator, not an LLM call. The module docstring says it
replaced an earlier Gemini-based reviewer. It checks five criteria:

1. The report is a non-empty dict with a title.
2. The executive summary is at least 100 characters.
3. `recommendations` is a non-empty list.
4. `sections` is a dict with at least three entries longer than 20 characters.
5. No placeholder patterns (`Competitor A`–`C`, `keyword_<n>`, `[keyword]`, `[query]`, …) survive
   in the text.

On approval the quality score is `min(1.0, 0.7 + sections/20 + min(len(summary), 500)/2000)`.
The template fallback report passes all five checks, so a run with no Gemini key still ends
`completed`.

**Gemini text calls per run:**

- **Typically 2:** insights plus one report pass.
- **Worst case 7:** each report pass can make 2 attempts (primary and simple retry), and the
  report node can run 3 times, so 1 + 3 × 2.
- **0** when no key is set.

Ask AI answers, embeddings and the legacy `/api/rag/query` are separate calls, made after the run.

---

## Data Sources

### Live Sources

| Source | API | Free tier (vendor terms, not verified here) | Credentials | Fallback |
|---|---|---|---|---|
| Hacker News | Algolia HN Search (`hn.algolia.com/api/v1/search`) | Open, no key (rate limits unverified) | **None** | Mock HN-style comments on an API error or zero hits |
| The Guardian | Content API (`content.guardianapis.com/search`) | 5,000 req/day | `GUARDIAN_API_KEY` | Mock Guardian-style articles |
| NewsData.io | `newsdata.io/api/1/news` | 200 req/day, 10 articles/req | `NEWSDATA_API_KEY` | Mock news headlines |
| Bluesky | AT Protocol `app.bsky.feed.searchPosts` | Open to authenticated users | `BLUESKY_IDENTIFIER` + `BLUESKY_APP_PASSWORD` | Mock Bluesky posts |
| YouTube | YouTube Data API v3 | 10,000 units/day | `YOUTUBE_API_KEY` | Mock comments |
| Reddit | PRAW, plus a keyless public-JSON fallback | 60 req/min | `REDDIT_CLIENT_ID` + `SECRET` (optional) | Public JSON, then mock |

Every scraper subclasses `BaseScraper` (`scrapers/base.py`) and implements
`_scrape_impl(query, max_results)`. `BaseScraper.scrape()` adds two things:

- **Retries:** up to 3 attempts, waiting 2 s and then 4 s (`backoff_factor ** attempt`), after
  which it **raises `RuntimeError`**.
- **A per-instance minimum delay** between attempts.

So `BaseScraper` itself can raise. "A scraper never fails the pipeline" holds in practice only
because every `_scrape_impl` catches its own exceptions and returns mock data in the identical
dict shape. Twitter/X cannot fail at all. The only explicit timeouts are httpx's 10–15 s per
request; the PRAW and YouTube client calls run in an executor with no timeout set.

Template data is stored exactly like live data: the same keys, the same `source` value, and no
flag. Only Ask AI infers which rows are simulated (see Ask AI below).

`DEBUG=true` forces YouTube to template data and makes Reddit skip PRAW (public JSON, then
template data). `.env.example` ships with `DEBUG=false`.

**Bluesky credentials are required, not optional.** The public appview returns HTTP 403 for
unauthenticated `searchPosts`. That comes from a manual check made when the scraper was written,
and the code comments in `config.py` and `scrapers/bluesky.py` say the same; it has not been
re-tested here. The same check found that `app.bsky.actor.getProfile` still returned 200 on the
host, so the block looked endpoint-specific. Without credentials the Bluesky source still tries
the public endpoint and then silently falls back to mock data.

### Simulated Sources

**Twitter/X** — fully simulated in `backend/app/scrapers/twitter.py`, which has no network code at
all. The module docstring gives the reason: X's API requires paid access, which is not justifiable
for this project. Rather
than drop the source, it runs a local sentiment simulator that generates plausible product
commentary. It is labelled "Simulated" in the workflow-creation UI and disclosed in the README —
it is presentation data, not evidence.

---

## Ask AI

Ask AI answers questions about one completed workflow from that workflow's stored comments,
with citations to the exact comments. It runs after the pipeline and never inside it. Code:
`api/ask.py`, `services/ask_service.py`, `rag/indexer.py`, `rag/embeddings.py`,
`rag/vectorstore.py` and `rag/provenance.py`.

### Storage: Postgres is the source of truth

- **Collections:** one Chroma collection per workflow, named `wf_<workflow uuid>`. The name is
  built only from a server-verified UUID and checked against Chroma's naming rules. Collections
  use cosine distance (`hnsw:space = cosine`), and one that isn't cosine is recreated.
- **Client:** if `CHROMA_HOST` is set (Compose sets `chromadb`), the store uses
  `chromadb.HttpClient` plus a heartbeat. If the host is unset or unreachable, it falls back to
  `PersistentClient(CHROMA_PERSIST_DIR)` and logs a warning.
- **Plan and rebuild:** `ensure_workflow_index()` builds a deterministic chunk plan from the
  workflow's `scraped_data` rows, then makes the collection match it. It deletes stale ids and
  embeds only the missing chunks, batch by batch, so progress survives a failure. A wiped disk, an
  index left half-built by a rate limit, and a workflow that finished before Ask AI existed are
  all the same case. No tables or columns were added.
- **Concurrency:** a per-workflow `asyncio.Lock`, and one shared build task per workflow. Both are
  in memory and per process.
- **Indexing triggers:**
  - After a run's final commit, when the status is `completed` or `auto_approved` and
    `ASK_AI_INDEX_ON_COMPLETE=true`. This is best effort: the task opens its own session and never
    writes to `workflows`.
  - On every question.
  - On legacy `POST /api/rag/index`.
- **Cleanup:** `DELETE /api/workflows/{id}` drops the collection in the background.
  `DELETE /api/reports/{id}` does **not** (see Known Issues).

### Chunking and embeddings

- **Chunks:** one comment is one chunk. Text over 600 characters is split into windows of about
  600 characters with about 100 characters of overlap, cut at a space, so every piece is a
  verbatim substring. Text under 15 characters is skipped.
- **Cap:** at most `ASK_AI_MAX_CHUNKS=400` chunks per workflow, taken round-robin across sources
  so a cap never drops a whole source.
- **Chunk records:** the id is `<scraped_data_id>:<n>`. Metadata is `scraped_data_id`, `source`,
  `sentiment_label`, `sentiment_score`, `simulated`, and `url`. The `url` is stored only for
  non-simulated rows with an http(s) URL; YouTube URLs are built from `video_id`.
- **Embedding model:** `EMBEDDING_MODEL=models/gemini-embedding-001` at `EMBEDDING_DIM=768`, with
  `task_type` `retrieval_document` for chunks and `retrieval_query` for questions, in batches of
  `EMBEDDING_BATCH_SIZE=50`.
- **No fallback:** `embed_strict()` never falls back to non-semantic vectors.
  - On a rate limit it waits for the API's "retry in N s" hint plus 1 s (15 s if there is no hint).
  - It waits 5 s on transient 5xx errors.
  - It fails at once on a daily quota or any other error.
  - The wait budget is 600 s per call during indexing (one call per batch), and 15 s for a
    question.
- **Simulated rows:** `provenance.py` re-renders every scraper's mock templates for the workflow's
  query, cleans them the way the pipeline does, and marks a row `simulated` when its content starts
  with one of them. `twitter` is always simulated. `simulated: false` means "not recognised as
  generated", not "verified real". No URL is ever returned for a simulated row.

### Answering a question

Request handling is described under Request Flow above. `answer_question()` then runs these steps:

1. Load the plan from Postgres, then close the DB session before the slow calls.
2. Collect up to 2 earlier **user** turns from `history`. Assistant turns are never used. Turns
   matching an injection pattern are dropped, and each turn is capped at 300 characters.
3. Wait up to `ASK_AI_INDEX_WAIT_SECONDS=25` for the index. If it is still building, return
   **202** `{"detail": …, "preparing": true}` with `Retry-After: 10`; the build continues in the
   background.
4. Embed the question plus the previous user question, then retrieve the top
   `ASK_AI_TOP_K=8` chunks. Similarity is `1 − cosine distance`.
5. **Not-covered gate:** if there are no hits, or the best similarity is below
   `ASK_AI_MIN_SIMILARITY=0.6`, return a fixed `not_covered` answer **without calling Gemini**.
   The 0.6 value was tuned by hand on one workflow (`docs/ASK_AI_PLAN.md` §4).
6. Make one Gemini call: `gemini-2.5-flash`, JSON mode, temperature 0.2, up to 2 attempts.
   - The prompt numbers the excerpts `[1]…[k]` inside `<excerpts>` and puts the question inside
     `<question>`. It says everything inside those tags, and inside `<earlier_questions>` and
     `<workflow_stats>`, is data, not instructions.
   - `<`, `>`, `[` and `]` in excerpts, the topic and questions are replaced with `‹ › ( )`, so a
     comment can't close a delimiter or forge a citation.
   - Simulated excerpts are labelled `SIMULATED demo data`.
   - A `<workflow_stats>` block carries per-source counts and the sentiment split. The model is
     told to use only that block for counts.
7. **Validation:** an unknown status becomes `partial`. Cited ids outside the retrieved set are
   dropped, and their `[n]` markers are removed. An answer left with no valid citation becomes
   `not_covered` with the fixed message. Answers are capped at 2,000 characters.
8. Citations are built from the stored chunk: `{id, source, text, sentiment_label, simulated,
   url?}`. The text never comes from the model.

Failures return **503** with a friendly message: no key, embedding or Chroma failure, a Gemini
failure, or unparseable output. The free tier's daily embedding quota gets its own message.
A structlog `ask_ai_answered` event records stage timings, best similarity and the status, but
never comment text.

### Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/workflows/{id}/ask/status` | `{indexed, chunk_count, chunk_total, indexing, simulated_share, item_count, workflow_status, query}`; 200 even while the run is in progress |
| POST | `/api/workflows/{id}/ask` | Body `{question, history}`. 200 `{answer_status: answered\|partial\|not_covered, answer, citations[], retrieved_count}`, 202 while preparing, 400 / 401 / 404 / 409 / 422 / 429 / 503 |
| POST | `/api/rag/query` | Legacy, uncited. Ownership is checked when `workflow_id` is given; without one it queries an empty `global_knowledge` collection. Uses the fallback-capable `generate()` embeddings and returns a hardcoded `confidence: 0.85` |
| POST | `/api/rag/index` | Legacy. `workflow_id` as a query parameter; starts the same background index build |

### Frontend

`/workflows/:workflowId/ask` is its own lazy chunk (`frontend/src/features/ask-ai/`).

- **Polling:** status every 15 s while the run is executing, and every 4 s while the index
  builds. After a 202 it shows "n of m passages ready" and re-asks automatically.
- **Rendering:** answers are plain text. `[n]` markers are buttons that highlight a source card,
  simulated citations get a badge, and nothing uses `dangerouslySetInnerHTML`.
- **History:** the conversation is kept in `sessionStorage` (`ask-ai:<workflowId>`, last 30
  messages), and the last 6 turns are sent with each question.
- **Entry points:** each completed row on Workflows, and each report card.

---

## Data Models

### Database Schema

| Model | Table | Key fields | Indexes |
|---|---|---|---|
| `User` | `users` | `email` (unique), `hashed_password`, `role`, `is_active` | `ix_users_email` |
| `Workflow` | `workflows` | `user_id`, `query`, `status`, `sources`, `agent_states` | `ix_workflows_user_id`, `ix_workflows_user_status`, `ix_workflows_created_at` |
| `ScrapedData` | `scraped_data` | `workflow_id`, `source`, `content`, `sentiment_score`, `sentiment_label`, `metadata_`→`metadata` | `ix_scraped_data_workflow_source` |
| `Report` | `reports` | `workflow_id`, `user_id`, `title`, `executive_summary`, five JSON sections | `ix_reports_user_id`, `ix_reports_workflow_id` |
| `Analytics` | `analytics` | `workflow_id`, `metric_type`, `metric_data` | `ix_analytics_workflow_id`, `ix_analytics_workflow_metric` |
| `AgentLog` | `agent_logs` | `workflow_id`, `user_id`, `agent_name`, `status`, `execution_time_ms` | `ix_agent_logs_workflow_id`, `ix_agent_logs_user_id` |
| `ScheduledTask` | `scheduled_tasks` | `user_id`, `name`, `query`, `cron_expression`, `is_active` | — |
| `EmbeddingMetadata` | `embeddings_metadata` | Declared for RAG bookkeeping. **Never written**: rows are only ever deleted, by the workflow and report delete paths. Ask AI derives chunk ids from `scraped_data.id` instead | — |

That is **11 indexes** in total: the 10 declared in `__table_args__` plus `ix_users_email`, which
comes from `unique=True, index=True` on `users.email`. Nine of the ten were added in commit
`1d58c24`.

`metric_type` values in use: `sentiment_distribution`, `keyword_frequency`, `trend_data`,
`competitor_score`. Only `keyword_frequency` and `competitor_score` are read back, by
`/api/dashboard/keywords` and `/api/dashboard/competitors`, and the frontend calls neither.

`agent_logs` rows are written by every run but never read by any endpoint:
`/api/monitoring/agents` is a stub returning `[]`. `scheduled_tasks` rows are created and listed,
but never executed.

No foreign key declares `ON DELETE`. The services delete child rows by hand. SQLite does not
enforce foreign keys, because no `PRAGMA foreign_keys=ON` is set, so a local SQLite database can
hold orphan rows.

Ask AI added no tables or columns. Its vectors are a cache keyed `wf_<workflow id>` /
`<scraped_data id>:<n>` and rebuilt from `scraped_data` whenever they are missing; chat history stays
in the browser (`sessionStorage`) and is sent back with each question.

`Workflow.status` values and where they are set:

- `pending`: on create.
- `running`: when the background task starts.
- `completed` or `auto_approved`: from the reviewer's final `state["status"]`.
- `failed`: on any exception in the task, with the exception text in `result_summary`.

`auto_approved` means the reviewer hit the 2-revision ceiling and force-approved. The dashboard
and the Workflows page both count and display it alongside `completed`; the Workflows page gives
it a distinct amber indicator.

Nothing resets a run that was `running` when the process stopped, so such a run stays `running`
forever.

`Report.status` is set in `tasks.py` to `auto_approved`, `completed` or `draft`. The graph only
reaches `END` after approval, so `draft` does not occur in practice.

### Relationships

`User` is the root: it owns many `Workflow`, `Report`, and `AgentLog` rows. `Workflow` owns many
`ScrapedData`, `Report`, `Analytics`, and `AgentLog` rows. `Report` and `AgentLog` carry both
`workflow_id` and `user_id`, which denormalises the ownership check so user-scoped queries do not
need a join through `workflows`.

All relationships are declared `lazy="select"`. Nothing in the application reads them as ORM
attributes — every query goes through an explicit `select()` on the foreign keys — so eager loading
was pure overhead. See Performance below.

---

## API Reference

### Endpoint Map

The OpenAPI schema has 29 paths and 33 operations. `/metrics` and `HEAD /` are kept out of it.
All `/api/*` routes require a bearer token except four: register, login, admin-login and
`/api/monitoring/health`. "Owner" routes return the same 404 for a missing row and for someone
else's row.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET / HEAD | `/` | none | Service name, version, status; no DB access (uptime pings) |
| GET | `/metrics` | none | Prometheus exposition (307 to `/metrics/`) |
| POST | `/api/auth/register` | none | Create account; returns the user (no token). The first account on an empty DB becomes admin |
| POST | `/api/auth/login` | none | OAuth2 password form, returns `{access_token, token_type, user}` |
| POST | `/api/auth/admin-login` | none | Same as login, but 403 for valid credentials of a non-admin |
| GET | `/api/auth/me` | user | The caller's own profile; the frontend uses it to validate a stored session |
| GET | `/api/auth/users` | admin | List all users (read-only; ordered by `created_at`) |
| POST | `/api/workflows/` | user | Create workflow, schedules background pipeline. 400 on an injection pattern. `sources` is not validated against the seven known names |
| GET | `/api/workflows/` | user | Paginated workflow list (`skip=0`, `limit=10` by default, no upper bound) |
| GET | `/api/workflows/{id}` | user + owner | Single workflow |
| DELETE | `/api/workflows/{id}` | user + owner | Delete workflow (explicit rollback on failure); its Chroma collection is dropped in the background |
| GET | `/api/workflows/{id}/ask/status` | user + owner | Ask AI index state: `indexed`, `chunk_count`/`chunk_total`, `indexing`, `simulated_share`, `item_count` |
| POST | `/api/workflows/{id}/ask` | user + owner | Ask AI answer with validated citations; 202 while the index builds, 409 while the run is unfinished, 429 rate limit, 503 on Gemini/quota failure |
| GET | `/api/reports/` | user | Paginated report list (`limit=10` by default) |
| GET | `/api/reports/{id}` | user + owner | Single report |
| DELETE | `/api/reports/{id}` | user + owner | Delete report. **Also deletes the report's workflow and its scraped data, analytics and agent logs** (`report_service.delete_report`); the Ask AI collection is not dropped |
| GET | `/api/reports/{id}/export/pdf` | user + owner | PDF via reportlab |
| GET | `/api/reports/{id}/export/docx` | user + owner | DOCX via python-docx |
| GET | `/api/dashboard/overview` | user | Six headline metrics — cached 30s |
| GET | `/api/dashboard/sentiment` | user | Sentiment distribution — cached 30s |
| GET | `/api/dashboard/trends` | user | Sentiment grouped by source — cached 30s |
| GET | `/api/dashboard/keywords` | user | Top 20 keywords — cached 30s. The `sentiment` field is really the keyword frequency |
| GET | `/api/dashboard/competitors` | user | Competitor analysis — cached 30s. **500 once Gemini output is stored** (see Known Issues) |
| GET | `/api/dashboard/recent-activity` | user | 5 most recent workflows — **never cached** |
| POST | `/api/schedules/` | user | Create schedule (stored, not executed) |
| GET | `/api/schedules/` | user | List own schedules |
| DELETE | `/api/schedules/{id}` | user + owner | Deactivate own schedule (500 for a non-UUID id) |
| POST | `/api/rag/index` | user + owner | Legacy: starts indexing an owned workflow (was a no-op). `workflow_id` is a query parameter |
| POST | `/api/rag/query` | user + owner | Legacy uncited RAG answer over an owned workflow's collection |
| GET | `/api/monitoring/health` | **none** | Health probe (`SELECT 1`) |
| GET | `/api/monitoring/system` | admin role | psutil CPU / memory / pid |
| GET | `/api/monitoring/agents` | admin role | **Stub — returns `[]`** |
| GET | `/api/admin/users` | admin role | **Stub — returns `[]`** |
| GET | `/api/admin/stats` | admin role | **Stub — returns `{"status": "ok"}`** |

"Cached 30s" means the response carries `Cache-Control: private, max-age=30` for the browser.
There is no server-side cache.

---

## Frontend Architecture

### Routing (`frontend/src/App.tsx`)

| Path | Access | Chunk |
|---|---|---|
| `/` | public landing page | lazy (`landing/`, own CSS; calls no API except a warm-up ping when `VITE_API_URL` is set) |
| `/login`, `/signup` | public | main bundle |
| `/dashboard` | `ProtectedRoute` | lazy (Recharts, GSAP) |
| `/workflows`, `/reports`, `/settings` | `ProtectedRoute` | main bundle |
| `/workflows/:workflowId/ask` | `ProtectedRoute` | lazy (`features/ask-ai/`, own CSS) |
| `/users` | `ProtectedRoute` + `RequireRole role="admin"` (others are redirected to `/dashboard`) | main bundle |
| `*` | – | redirects to `/` |

The protected routes share `Layout` (sidebar, header, outlet). `RequireRole` is UX only; the API
enforces the role itself with a 403. The sidebar hides the Users link for non-admins.

Login and signup go to `/dashboard`. Logout clears the session and goes to `/login`.

### Session handling (`context/AuthContext.tsx`, `api/client.ts`)

- **Storage:** the token and user are stored in `localStorage` (`token`, `user`).
- **Restore:** on load, `readStoredSession` accepts a stored session only if the token is a
  3-part JWT whose `exp` is still in the future and the stored user has string `id`, `email` and
  `role`. Anything else is cleared before the first render.
- **Confirm:** the session is then confirmed in the background with `GET /api/auth/me`. A 401
  ends it; network errors leave it in place, so a cold start doesn't log people out.
- **Login and signup:** both clear any existing session before trying. Signup calls `/register`
  and then logs in with the same credentials, because `/register` returns no token.
- **401 handling:** a 401 on any request except the login, admin-login and register forms
  clears storage and redirects to `/login?session=expired`.

### Data fetching

- **Workflows** polls `GET /api/workflows/` every 15 s with `setInterval`.
- **Reports** fetches `GET /api/reports/` once on mount and does not poll.
- **Dashboard** fetches once on mount: the workflow list, then overview, sentiment and trends for
  the newest completed workflow. It refetches only when another workflow is picked.
- Both list calls use the API default `limit=10`, and there is no pagination UI.
- **Header:** notifications are built once from `/api/dashboard/recent-activity`.
- There is no global store; state is component-local plus the Auth, Theme and Toast contexts.

### Theming

- **Dark mode** is class-based. An inline script in `index.html` sets `.dark` before first paint,
  from `localStorage.theme` or else the OS preference.
- **Design tokens** are CSS variables in `index.css`, mapped into Tailwind 4 with `@theme`.
- **Charts** read resolved token values at runtime (`useChartColors`).
- **Sentiment colours** are a diverging blue / grey / red set reserved for data; the UI accent is
  ink rather than a hue.

---

## Performance Characteristics

### Known Bottlenecks

| Bottleneck | Root cause | Status |
|---|---|---|
| Slow dashboard load | `get_overview_metrics` issued six sequential `await db.execute()` calls — six round-trips per load | **Fixed** — folded into one SELECT of scalar subqueries |
| Slow queries across the board | No indexes on `user_id`, `workflow_id`, `metric_type`; every dashboard query was a full table scan | **Fixed** — 9 indexes added (11 in total today) |
| Indexes never actually applied | `create_all` skips existing tables, so newly declared indexes were silently ignored on a live DB | **Fixed** — `init_db` now creates missing indexes explicitly |
| Heavy cost on every authenticated request | `User` relationships were `lazy="selectin"`, so loading the current user eager-loaded that user's entire reports, workflows, and agent_logs | **Fixed** — changed to `lazy="select"` |
| N+4 queries on the workflow list | `Workflow` relationships were `lazy="selectin"` — 3 extra SELECTs per workflow row | **Fixed** — changed to `lazy="select"` |
| Redundant dashboard fetches on mount | Two chained `useEffect`s, the second keyed on `[selectedWorkflowId, workflows.length]`, both firing during mount | **Fixed** — single init effect plus a ref-guarded selection effect |
| UI hangs on a stalled backend | axios had no timeout | **Fixed** — 30 s default; 90 s for login/register (cold starts), 60 s for Ask AI |
| Workflow polling churn | 10s interval | **Fixed** — 15s (cleanup was already correct) |
| Large frontend bundle (everything in one chunk; recharts is the bulk) | No code splitting | **Fixed** — Dashboard, Landing and Ask AI are route-level lazy chunks (sizes below) |
| Login blocked the event loop | bcrypt ran synchronously inside async handlers | **Fixed** — hash and verify run in the threadpool |
| Gemini latency dominates workflow runtime | Typically 2 sequential LLM calls per run (up to 7), each seconds long | **Open by design** — inherent to the pipeline |
| PDF/DOCX export blocks the event loop | `generate_pdf` / `generate_docx` run synchronously inside async routes | **Open** |

### Frontend bundle (measured)

`vite build` into a scratch directory, gzip measured with Node's `zlib` at default level:

| Chunk | Loaded on | Raw | Gzip |
|---|---|---|---|
| `index-*.js` | every page | 324.9 kB | 104.4 kB |
| `index-*.css` | every page | 52.2 kB | 11.4 kB |
| `Dashboard-*.js` (Recharts, GSAP) | `/dashboard` | 444.3 kB | 135.1 kB |
| `Landing-*.js` + `.css` | `/` | 19.9 + 26.1 kB | 6.1 + 6.0 kB |
| `AskAi-*.js` + `.css` | `/workflows/:id/ask` | 14.5 + 8.0 kB | 5.4 + 2.0 kB |

The build warns about one ineffective dynamic import. `Reports.tsx` imports `api/client.ts`
dynamically, but other modules import it statically, so nothing is split.

### Database Query Patterns

The dashboard's six headline metrics are now computed in a **single round-trip**. Each metric is
built as a `scalar_subquery()` and all six are selected together:

```python
select(
    total_workflows_sq.label("total_workflows"),
    completed_workflows_sq.label("completed_workflows"),
    total_reports_sq.label("total_reports"),
    data_points_sq.label("total_data_points"),
    active_schedules_sq.label("active_schedules"),
    avg_sentiment_sq.label("avg_sentiment_score"),
)
```

**These cannot be parallelised with `asyncio.gather`.** An `AsyncSession` is not safe for concurrent
use; issuing several `db.execute()` coroutines against one session raises
`sqlalchemy.exc.IllegalStateChangeError` ("method `_connection_for_bind()` is already in progress").
This was tested directly rather than assumed. One round-trip is both faster than six sequential
awaits and correct, so the single-statement form is strictly better than a gather would have been
even if a gather were safe.

The two `ScrapedData` aggregates (count and average sentiment) both join through `workflows`, which
is why `ix_workflows_user_id` and `ix_scraped_data_workflow_source` matter most for dashboard latency.

---

## Security

### Auth Flow

**Registration.** `POST /api/auth/register` validates the email (a regex, case preserved), the
password (at least 8 characters and at most 72 UTF-8 bytes, the bcrypt limit) and a non-empty
name.

- A duplicate email gets `400 Email already registered`.
- **The first account on an empty database becomes `admin`**; everyone after is `viewer`. The
  request schema has no role field, so a `role` key in the body is ignored.
- The response is the user without a token. The frontend logs in straight afterwards.

1. **Login.** `POST /api/auth/login` verifies credentials with bcrypt (cost `BCRYPT_ROUNDS`,
   default 12, allowed 10–15). Hashing and verifying run in the threadpool, so they never block
   the event loop.
   - Unknown email, wrong password and inactive account all return the same
     `401 Invalid email or password`.
   - Unknown emails are checked against a cached dummy hash, so every login runs exactly one
     bcrypt check and timing does not reveal which accounts exist.
   - A stored hash made with a different cost is re-hashed on the next successful login.
   - `POST /api/auth/admin-login` behaves the same but returns 403 for a valid non-admin.
   - Emails are matched exactly; there is no lowercasing.
2. **Token.** The server issues an HS256 JWT signed with `JWT_SECRET_KEY`, with
   `sub = <user id>`, expiring after `ACCESS_TOKEN_EXPIRE_MINUTES`.
   - The **code default is 480 minutes** (8 hours).
   - A local `.env` may override it (for example, `30`). Docker Compose injects the root `.env`.
   - The production value is **unknown**: Render's settings are not in the repo.
   - If `JWT_SECRET_KEY` is still the built-in placeholder, startup logs a warning but still runs.
3. The browser stores the token in `localStorage`, and an axios request interceptor attaches it as
   `Authorization: Bearer <token>`.
4. `get_current_user` decodes the token (signature and `exp`) per request and loads the `User`
   row. A missing or inactive user gets 401. `require_role("admin")` layers a role check on top,
   returning 403.
   - It is used on `GET /api/auth/users` (all users, read-only, the only user listing), the
     `/api/admin/*` stubs, and `/api/monitoring/system` and `/agents`.
   - No route grants anything extra to the `analyst` role, and no endpoint changes a role.
5. On load the frontend drops a stored token that is malformed or past its `exp`, then confirms the
   rest with `GET /api/auth/me`.
6. An axios response interceptor catches any `401` outside the login, admin-login and register
   forms, clears `localStorage`, and redirects to `/login?session=expired`. Login and signup also
   clear any existing session before each attempt, so a failed login never leaves an old session
   signed in.

**There is no refresh token.** When the JWT expires (after 8 hours at the default) the user is
bounced to the login screen mid-session, losing whatever they were doing. `localStorage` also
means the token is readable by any successful XSS. There is no login throttling or lockout in the
app itself; only nginx's per-IP limit applies, and only under Docker Compose. These are
documented as future work below.

### Input Sanitization

`backend/app/core/sanitizer.py` provides two functions, both confirmed wired in:

- **`sanitize_query(query)`** — called in `create_workflow` (`api/workflows.py`) *before* the
  query is persisted or handed to the background task. In order, it:
  1. Rejects empty input.
  2. Truncates to 500 characters, then 60 words.
  3. Rejects anything shorter than 2 characters.
  4. Replaces a few delimiter sequences (`"""`, `'''`, `${`, `{{`, `}}`) with spaces.
  5. **Rejects** the query (`ValueError`, which the route maps to HTTP 400) if it matches any of
     19 injection regexes, such as `ignore … previous instructions`, `you are now a`, `act as a`,
     `jailbreak` or `[system]`.
  6. Normalises whitespace and drops non-printable characters.

  It does **not** strip injection phrases out of an otherwise-accepted query. The sanitized value
  overwrites the raw one, so the unsanitized string never reaches the database or the pipeline.
  The same patterns screen Ask AI questions (via `find_injection_pattern()`). They also reject
  innocent questions such as "Do people jailbreak it?".
- **`safe_query_for_prompt(query)`** — a second defence applied where the query is interpolated into
  an LLM prompt, in both `insight_agent.py:17` and `report_agent.py:18`.

`extract_json()` in the same module defensively parses Gemini responses that arrive wrapped in
markdown fences or with trailing prose.

### Ask AI

- **Ownership on every route**, the same 404 for missing and foreign workflows. Collection names are
  built from the server-verified UUID, never from client input. The legacy `/api/rag/query` gained
  the same check (it had none).
- **Retrieval-time prompt injection.** Scraped comments are untrusted. They enter the prompt as
  numbered excerpts inside `<excerpts>` delimiters, with `<`, `>`, `[` and `]` replaced so a comment
  can't close a delimiter or forge a citation, and the prompt says everything inside is data. The
  question is screened with `find_injection_pattern()` (the patterns `sanitize_query` uses) and
  cleaned by `sanitize_query`/`safe_query_for_prompt`. Assistant turns sent back by the client never
  reach the prompt.
- **Citations are validated server-side.** Ids outside the retrieved set are dropped, markers to
  them are removed, and an answer with no valid citation becomes `not_covered`. Citation text is
  the stored chunk, not model output.
- **Rate limit:** 10 questions per user per minute, in memory, per process.
- **Rendering:** the page renders answers and comments as plain text; only `[n]` markers become
  buttons. No `dangerouslySetInnerHTML`. Source links are shown only for http(s) URLs of
  non-simulated rows.
- **Logs** carry stage timings and similarity, never comment text.

---

## Known Issues & Future Work

### High Priority

1. **Thin test suite, no CI.** `backend/tests/` has 41 tests: 19 for auth and 22 for Ask AI. The
   pipeline, scrapers, dashboard, report export and the whole frontend have none, and there is no
   CI configuration. Changes there are still verified manually, which remains the single largest
   risk to the project.
2. **No refresh token.** An 8-hour expiry (the default) with a hard redirect to `/login` will
   interrupt a demo mid-flow. Either implement refresh tokens or raise the expiry for demo runs.
3. **Bluesky needs credentials or it silently mocks.** `BLUESKY_IDENTIFIER` and
   `BLUESKY_APP_PASSWORD` must be set in `.env`, otherwise the source produces mock data with only a
   log line to indicate it. Same for `NEWSDATA_API_KEY` and `GUARDIAN_API_KEY`.
4. **Alembic is configured but unused.** `backend/alembic/versions/` contains no migrations; the
   schema is created by `Base.metadata.create_all`. Because `create_all` skips existing tables,
   *any future column addition will not be applied to a live database* — `init_db` now handles
   missing indexes, but not missing columns. A real migration is required before the next schema
   change.

### Confirmed Bugs

Each of these was confirmed in code; most were also reproduced against a locally running app
with a scratch SQLite database. None is fixed yet.

| Bug | Where | Impact |
|---|---|---|
| `GET /api/dashboard/competitors` returns 500 | `services/dashboard_service.py:get_competitor_data` calls `comp.get("name")`, but the insight prompt asks Gemini for `top_competitors` as a list of **strings** | Breaks as soon as a real Gemini insight is stored (`AttributeError: 'str' object has no attribute 'get'`). Latent, because the UI doesn't call it |
| Keyword "sentiment" is really frequency | `dashboard_service.get_keyword_data` averages `kw["score"]`, and `nlp/keywords.py` sets `score = float(frequency)` | `/api/dashboard/keywords` reports, for example, `sentiment: 13.0` for a word seen 13 times |
| Fallback report's sentiment sentence never appears | `agents/report_agent.py:_fallback_report` counts lowercase `"positive"`, but `nlp/sentiment.py` emits uppercase labels | Template reports always omit the sentiment breakdown |
| `DELETE /api/schedules/{id}` returns 500 for a non-UUID id | `api/schedule.py` takes `schedule_id: str`; `services/schedule_service.py` compares it with a UUID column | A malformed id gives a 500 instead of a 404 (reproduced on SQLite; Postgres behaviour not tested) |
| "AI Quota Exceeded" shown with no key configured | `report_agent.py` uses `_fallback_report` when `GEMINI_API_KEY` is empty, and its title and summary blame the quota | A misleading report title and summary |
| `avg_sentiment_score` is not a polarity | `dashboard_service.get_overview_metrics` averages `sentiment_score`, which is a constant 0.8 for **both** positive and negative and 0.5 for neutral | The headline "average sentiment" number has no meaning |
| A run in flight at restart stays `running` forever | the pipeline runs as an in-process FastAPI `BackgroundTasks` job; `main.py`'s lifespan has no reaper | Stuck rows after a deploy, crash or free-tier sleep |
| Only the 10 most recent workflows or reports are shown | `api/workflows.py` and `api/reports.py` default `limit=10`; the frontend never passes `skip`/`limit` and has no pagination UI | Older runs are unreachable from the UI. The Dashboard picker only offers completed runs among those 10 |
| Deleting a report deletes its whole workflow | `services/report_service.py:delete_report` also deletes the workflow, its scraped data, analytics and agent logs, and doesn't drop the Chroma collection | The UI asks "delete this report?" but removes the whole run, and its vectors are orphaned |
| Ask AI injection filter has false positives | the shared patterns in `core/sanitizer.py` include `jailbreak`, `act as a`, … | Innocent questions like "Do people jailbreak it?" get a 400 |
| Unknown source names are accepted and ignored | `schemas/workflow.py` takes `sources: List[str]`; `agents/research_agent.py` only matches the seven known names | A typo silently drops a source |
| Legacy `/api/rag/query` leaks errors and fakes confidence | `rag/retriever.py` returns `str(e)` in the answer and a hardcoded `confidence: 0.85` | Internal errors reach clients, and the confidence is meaningless |
| Prometheus scrapes the wrong path | `monitoring/prometheus/prometheus.yml` uses `/api/monitoring/metrics` (404); the app mounts `/metrics` (`main.py`) | No metrics are collected |
| Grafana dashboard queries non-existent metrics | `monitoring/grafana/dashboards/agentflow.json` uses `agentflow_active_workflows`, `agentflow_llm_tokens_total`, `agentflow_agent_execution_duration_seconds_*` and labels `status` / `handler` | Only `http_requests_total` and `http_request_duration_seconds` exist (labels `method`, `endpoint`, `http_status`; `core/middleware.py`), so the panels are empty. There is no Grafana datasource or provisioning YAML either |
| `CORS_ORIGINS` crashes startup if comma-separated | pydantic-settings parses `list[str]` from the environment as JSON | It must be set as a JSON array, and it isn't in `.env.example` |

### Security & Operations

- **JWT in `localStorage`.** It is readable by any successful XSS, and the nginx CSP allows
  `'unsafe-inline'` and `'unsafe-eval'` scripts.
- **No login throttling or lockout** in the app.
- **The first registrant becomes admin.** On a fresh or empty production database, whoever signs
  up first owns it.
- **The pipeline runs in-process**, with no queue, no concurrency limit and no overall timeout.
  Gemini calls set no request timeout, and neither do PRAW or the YouTube client. Everything a run
  collects stays in memory until one final commit.
- **Unpinned backend dependencies.** `backend/requirements.txt` has no versions and there is no
  lockfile, so builds are not reproducible. Docker images also use `:latest` for Chroma,
  Prometheus and Grafana.
- **`datetime.utcnow()` / `utcfromtimestamp()`** are used in 14 places. They are deprecated since
  Python 3.12.
- **PDF and DOCX generation** run synchronously in async routes and block the event loop while
  they run.
- **Prometheus `endpoint` labels** use the raw path, UUIDs included, so label cardinality is
  unbounded.

### Medium Priority

5. **`google.generativeai` is deprecated** — see the dedicated section below.
6. **Admin endpoints are stubs.** `GET /api/admin/users` returns `[]` and `GET /api/admin/stats`
   returns `{"status": "ok"}`. They are correctly protected by `require_role("admin")`, but they do
   nothing. The frontend Users page reads `/api/auth/users` instead, so nothing is broken — but a
   reviewer clicking through the OpenAPI docs will find hollow routes.
7. **Schedules are stored but never run.** Full CRUD works and rows persist, but no background
   runner reads `cron_expression` / `next_run_at`. `apscheduler` was removed as an unused
   dependency. The router carries a comment saying so. Implementing this needs a scheduler process
   (APScheduler in the backend, or an external cron hitting an internal endpoint).
8. **Frontend bundle.** The Recharts-heavy Dashboard, the landing page and Ask AI are lazy-loaded.
   The main JS chunk every page downloads is 104.4 kB gzipped, plus 11.4 kB of CSS. The Dashboard
   chunk is 135.1 kB gzipped. See Performance above.
9. **SQLite/Postgres split.** `config.py` falls back to `sqlite+aiosqlite:///./agentflow.db` when
   `DATABASE_URL` is unset. Settings read `.env` from the **current working directory**, so a
   backend started from `backend/` (as `make dev` and plain `uvicorn` usage do) reads no `.env`
   at all. It silently runs on SQLite with code defaults unless the variables are exported. Local
   behaviour can diverge from production Postgres (type coercion, concurrency, foreign keys, which
   SQLite doesn't enforce here). Fine as long as it stays a documented dev-only fallback.

### Ask AI limitations

- **Free-tier embedding quota.** During development (`docs/ASK_AI_PLAN.md`; not re-measured) it
  allowed 100 texts a minute and 1,000 a day per project. A first build of a ~300-chunk workflow
  took 2–3 minutes (the API answers 202 meanwhile), so about 3–6 workflows could be indexed a day.
  `ASK_AI_INDEX_ON_COMPLETE=false` saves the quota for workflows someone asks about. The code fails
  fast on a daily-quota error and returns its own 503 message.
- **Render's disk is ephemeral**, so collections are rebuilt (and re-embedded) after each restart.
  A persistent disk or a hosted Chroma would avoid the repeat cost.
- **Top-k is a sample, not a count.** Counting questions rely on the stats block, not the excerpts.
- **The 0.60 similarity threshold was tuned by hand** on one workflow
  (`docs/ASK_AI_PLAN.md`, section 4). History is folded into the retrieval query, which helps
  follow-ups but lets an off-topic follow-up pass the gate; Gemini then answers `not_covered`.
- **Simulated rows are recognised by template text** (`rag/provenance.py`); a template edited after
  a run is no longer recognised for that run.
- **Per-process state:** the rate limit, build tasks and locks live in one process, which is right for
  a single Render instance but not for several workers.
- **No streaming**, and chat history is per browser tab only.

### Low Priority / Nice to Have

10. **`PROMETHEUS_PORT` in `.env.example` is unreferenced.** Nothing in the code or
    `docker-compose.yml` reads it; Compose hardcodes `9090:9090` and Grafana's `3000:3000`.
    (`GRAFANA_PORT` is no longer in `.env.example`.)
11. **Reddit user agent.** `.env.example` sets `REDDIT_USER_AGENT=OpinionMap/1.0 (by /u/your-reddit-username)`,
    and the settings default is `OpinionMap/1.0`. Only an unreachable fallback literal in
    `scrapers/reddit.py` (`AgentFlow:v1.0 (by /u/agentflow_bot)`) still carries the old project
    name.
12. **`frontend/src/assets/hero.png` (16 KB) is unreferenced.** Left in place because it is a real
    asset rather than framework scaffold, and may be intended for future use.
13. **`docker-compose.yml` still declares `version:`**, which Compose v2 warns is obsolete.
14. **Bundle warns about an ineffective dynamic import** — `client.ts` is both statically and
    dynamically imported, so the dynamic import in `Reports.tsx` does not split anything.
15. **Dead code.** These are never used:
    - `services/auth_service.py` is imported by nothing, and it is the only importer of
      `schemas/auth.py`.
    - `EmbeddingMetadata` rows are never written.
    - The `AppError` subclasses are never raised.
    - The Header search box has no handler.
    - `Settings.tsx` is a placeholder.
    - The nginx `/ws/` location has no backend WebSocket routes.

### Deferred / Not Built

- Refresh tokens (or httpOnly-cookie sessions).
- A schedule runner for `scheduled_tasks`.
- Alembic migrations.
- A shared rate limiter, build-task registry and index locks (for more than one worker).
- The `google-genai` SDK migration.
- Persistent or hosted Chroma, so Render restarts don't re-embed.
- Lazy pipeline imports to shorten cold start (`docs/CHANGE_PLAN.md`, decision 8).
- Email lowercasing, which needs a data migration first.
- A job queue for pipeline runs.

### Specific Future Migration: google-genai SDK

The `google-generativeai` package prints a `FutureWarning` on import: all support has ended and
users are directed to the new `google-genai` package. This is currently **suppressed** at the top of
`backend/app/main.py` with a message-matched `warnings.filterwarnings` call, purely to keep logs
readable. Suppression changes no behaviour and is not a fix.

Migrating involves:

- Swapping the dependency in `requirements.txt` (`google-generativeai` → `google-genai`).
- Rewriting client construction: `genai.configure(api_key=...)` plus
  `genai.GenerativeModel('gemini-2.5-flash')` becomes a `genai.Client(api_key=...)` instance with
  `client.models.generate_content(model=..., contents=...)`.
- Reworking the JSON-mode configuration — `generation_config={"response_mime_type": ...}` moves into
  the new `config=types.GenerateContentConfig(...)` shape.
- Re-verifying `extract_json()` still handles the new response objects.

The touch points are narrow, five modules plus the startup call:

- `agents/insight_agent.py`
- `agents/report_agent.py`
- `rag/embeddings.py`
- `rag/retriever.py` (the legacy RAG path)
- `services/ask_service.py`
- the startup configure call in `main.py`

Estimated effort is **half a day** (an estimate, not measured), most of it re-testing the two LLM
nodes and their fallback paths. The upstream warning already says the package receives no
further updates or bug fixes.

### Specific Future Work: Test Suite

`backend/tests/test_auth.py` covers login, registration and user listing, and
`backend/tests/test_ask_ai.py` covers Ask AI end to end with fake embeddings and a fake Gemini:
ownership, validation, the injection screen, the rate limit, the not-covered gate, citation
stripping and downgrading, delimiting of injected comments, rebuild from Postgres, the 202 build
path, and that an indexing failure leaves a workflow `completed` (`cd backend && pytest`).
Recommended next, highest value first:

1. **Scraper fallback contract** — for all seven scrapers, assert `_scrape_impl` never raises with
   the network unavailable, always returns the `{source, content, metadata}` shape, and returns the
   correct `source` value. This is cheap, needs no network, and protects the pipeline's core
   invariant.
2. **`sanitize_query`** — table-driven tests over known prompt-injection strings. Security-relevant
   and pure-functional.
3. **`_validate_report`** in the reviewer — five criteria plus the placeholder regex, and the
   2-revision auto-approve ceiling. Pure function, no mocks needed.
4. **`get_overview_metrics`** — seed a SQLite database and assert the six metrics, including the
   empty-user case (`avg_sentiment_score` defaults to `0.5`) and that `auto_approved` counts toward
   `completed_workflows`.
5. **Auth edge cases** — `test_auth.py` already covers register, login, `/me` and the user list.
   Still missing: expired and forged tokens, and the full app's lifespan handler. The suite builds
   a minimal app, not `app.main`.
6. **Cleaning agent** — URL stripping, special-character handling, and the English heuristic.
7. **Dashboard aggregates and report delete** — these would have caught the competitors 500, the
   keyword-sentiment mix-up and the report-delete cascade listed under Confirmed Bugs.

Start with 1–3: they need no database and no network, so they can run in CI as soon as CI exists.

### Specific Future Work: Reddit API

Reddit API access was requested; its approval status is not recorded anywhere in the repo
(unverified). Without credentials, `RedditScraper` degrades in two steps. It first tries the
keyless public JSON search endpoint (`reddit.com/search.json`) with a browser user-agent, and only
falls back to generated mock posts if that also fails or returns nothing. Reddit can therefore
return genuine data with no credentials configured, but the public endpoint is not an official
API for this use. Its rate limits are unverified here.

Once `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` are approved and set, PRAW takes over and
searches a fixed list of product/technology subreddits, collecting both submissions and their top
five comments per post.
