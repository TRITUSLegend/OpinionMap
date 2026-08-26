# OpinionMap — Architecture & Technical Reference

## Overview

OpinionMap is a multi-agent market intelligence platform. A user submits a research query
("iPhone 17 battery life user sentiment"), and a six-node LangGraph pipeline scrapes seven data
sources, cleans and de-duplicates the text, runs sentiment/topic/keyword/trend NLP over it, asks
Google Gemini for structured insights, drafts a report, and passes that report through a
deterministic quality gate before persisting it.

The core technical approach is a **stateful agent graph**: every node receives and returns the same
`AgentState` TypedDict, so each agent is independently testable and the orchestration logic lives in
one place (`graph.py`) rather than being scattered across service code. The reviewer node closes a
conditional loop back to the report node, giving the pipeline a bounded self-correction cycle.

---

## System Architecture

### Infrastructure (Docker Compose)

Seven services. (An eighth, `mlflow`, was removed in an earlier cleanup pass — its Dockerfile and
compose entry are both gone.)

| Service | Container | Purpose | Port |
|---|---|---|---|
| `nginx` | `agentflow-nginx` | TLS termination and reverse proxy; the only public entry point | `80:80`, `443:443` |
| `frontend` | `agentflow-frontend` | React SPA built by Vite, served by its own nginx | internal only, proxied |
| `backend` | `agentflow-backend` | FastAPI application, the agent pipeline, all business logic | `8000:8000` |
| `postgres` | `agentflow-postgres` | Primary relational store (postgres:16-alpine) | internal only, `5432` |
| `chromadb` | `agentflow-chromadb` | Vector store for RAG document retrieval | internal only, `8000` |
| `prometheus` | `agentflow-prometheus` | Scrapes `/metrics` from the backend | `9090:9090` |
| `grafana` | `agentflow-grafana` | Dashboards over Prometheus metrics | `3000:3000` |

### Request Flow

**Synchronous read path**

```
Browser → nginx (443) → backend:8000 → FastAPI route → service layer → Postgres → JSON response
```

**Asynchronous workflow path**

```
Browser POST /api/workflows/
   → nginx → FastAPI create_workflow
   → sanitize_query() strips prompt-injection patterns
   → Workflow row written with status="pending"
   → BackgroundTasks schedules execute_workflow_task
   → HTTP 200 returns immediately with the workflow id

(background)
   execute_workflow_task
      → run_workflow(query, sources, workflow_id)
      → LangGraph: research → cleaning → nlp_analysis → insights → report → reviewer
      → reviewer approves, or loops back to report (max 2 revisions)
      → ScrapedData / Analytics / AgentLog / Report rows written
      → Workflow.status set to completed | auto_approved | failed

(meanwhile)
   Workflows page polls GET /api/workflows/ every 15s until the status settles
```

### Tech Stack

| Layer | Technology | Purpose | Notes |
|---|---|---|---|
| Frontend | React 19 + TypeScript | SPA | Vite build, ESLint clean at 0 problems |
| Styling | Tailwind CSS 4 | Utility-first styling | via `@tailwindcss/vite` |
| Charts | Recharts 3 | Sentiment/trend visualisation | |
| Routing | react-router-dom 6 | Client-side routes | |
| HTTP | axios | API client | 30s timeout, JWT interceptor, global 401 handler |
| API | FastAPI | REST API, DI, OpenAPI schema | 26 documented paths |
| Orchestration | LangGraph | Six-node stateful agent graph | `graph.py` / `state.py` |
| LLM | Google Gemini `gemini-2.5-flash` | Insight + report generation | via `google-generativeai` (deprecated, see below) |
| ORM | SQLAlchemy 2 (async) | Data access | `asyncpg` in Docker, `aiosqlite` locally |
| DB | PostgreSQL 16 | Primary store | |
| Vectors | ChromaDB | RAG retrieval | Gemini `text-embedding-004` embeddings |
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
`state["revision_count"]` and force-approves once it reaches 2, setting `state["status"]` to
`auto_approved` — this is what stops the loop from running forever when the report genuinely cannot
satisfy the quality checks.

**State keys read and written per node**

| Node | Reads | Writes |
|---|---|---|
| `research` | `query`, `sources` | `raw_data`, `errors`, `agent_logs` |
| `cleaning` | `raw_data` | `cleaned_data`, `agent_logs` |
| `nlp_analysis` | `cleaned_data` | `sentiment_results`, `topics`, `keywords`, `trends`, `agent_logs` |
| `insights` | `query`, `topics`, `keywords`, `trends` | `insights`, `competitor_analysis`, `pain_points`, `agent_logs` |
| `report` | `query`, `insights`, `competitor_analysis`, `pain_points` | `report`, `agent_logs` |
| `reviewer` | `report`, `revision_count` | `review_feedback`, `revision_count`, `status`, `agent_logs` |

Every node also sets `current_agent` and appends one entry to `agent_logs`.

### Agent Responsibilities

**research** — Fans out to whichever scrapers are named in `state["sources"]`, running them
concurrently with `asyncio.gather(..., return_exceptions=True)` so one failing source cannot abort
the run. Each scraper returns `{source, content, metadata}` dicts, which are concatenated into
`raw_data`. Exceptions are collected into `errors` rather than raised.

**cleaning** — Strips URLs and special characters, normalises whitespace, and applies a simple
English-detection heuristic (intersection against a common-word set, with a short-text escape
hatch). Filters out empty and non-English items to produce `cleaned_data`.

**nlp_analysis** — Runs four pipelines over the cleaned text: `SentimentAnalyzer` (per-item label and
score, attached back onto each item), `TopicExtractor` (keyword co-occurrence clustering),
`KeywordExtractor` (frequency plus per-keyword sentiment), and `TrendAnalyzer`. TopicExtractor and
TrendAnalyzer are singletons so repeated runs do not re-initialise them.

**insights** — Builds a prompt from the query, topics, keywords, and trends and asks Gemini for
structured JSON (`response_mime_type: application/json`). The query passes through
`safe_query_for_prompt()` first. On API failure it falls back to deterministic locally-derived
insights, so the pipeline always produces something downstream.

**report** — Assembles the executive summary, findings, competitor analysis, recommendations, and
pain-point sections into the `report` dict, again via Gemini with a local fallback. This is the node
the reviewer can send work back to.

**reviewer** — A deterministic local validator, not an LLM call. Checks five criteria: the report is
a non-empty dict with a title; the executive summary is at least 100 characters; recommendations is
a non-empty list; sections is a dict with at least three non-empty entries; and no placeholder
patterns (`Competitor A`, `keyword_0`, `[keyword]`, …) survive in the text. Replacing the previous
Gemini reviewer with this cut the per-run API calls from up to 5 down to 2 and removed a class of
retry loop.

---

## Data Sources

### Live Sources

| Source | API | Free tier | Credentials | Fallback |
|---|---|---|---|---|
| Hacker News | Algolia HN Search (`hn.algolia.com/api/v1/search`) | Unlimited, open | **None** | Mock HN-style comments |
| The Guardian | Content API (`content.guardianapis.com/search`) | 5,000 req/day | `GUARDIAN_API_KEY` | Mock Guardian-style articles |
| NewsData.io | `newsdata.io/api/1/news` | 200 req/day, 10 articles/req | `NEWSDATA_API_KEY` | Mock news headlines |
| Bluesky | AT Protocol `app.bsky.feed.searchPosts` | Open to authenticated users | `BLUESKY_IDENTIFIER` + `BLUESKY_APP_PASSWORD` | Mock Bluesky posts |
| YouTube | YouTube Data API v3 | 10,000 units/day | `YOUTUBE_API_KEY` | Mock comments |
| Reddit | PRAW, plus a keyless public-JSON fallback | 60 req/min | `REDDIT_CLIENT_ID` + `SECRET` (optional) | Public JSON, then mock |

Every scraper subclasses `BaseScraper`, which provides exponential-backoff retry and per-request rate
limiting, and implements `_scrape_impl(query, max_results)`. By contract `_scrape_impl` never raises —
on any failure it returns mock data in the identical dict shape, so the pipeline always has input.

**Bluesky credentials are required, not optional.** The public appview returns HTTP 403 for
unauthenticated `searchPosts` (verified: `app.bsky.actor.getProfile` still returns 200 on the same
host, so it is endpoint-specific rather than an IP or user-agent block). Without credentials the
Bluesky source silently runs in mock mode.

### Simulated Sources

**Twitter/X** — fully simulated in `backend/app/scrapers/twitter.py`. The X API's free tier does not
permit search, and the paid tiers start at a price that is not justifiable for this project. Rather
than drop the source, it runs a local sentiment simulator that generates plausible product
commentary. It is labelled "Simulated" in the workflow-creation UI and disclosed in the README —
it is presentation data, not evidence.

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
| `EmbeddingMetadata` | `embedding_metadata` | RAG vector bookkeeping | — |

`metric_type` values in use: `sentiment_distribution`, `keyword_frequency`, `trend_data`,
`competitor_score`.

`Workflow.status` values: `pending`, `running`, `completed`, `auto_approved`, `failed`.
`auto_approved` means the reviewer hit the 2-revision ceiling and force-approved — the dashboard and
Workflows page both count and display it alongside `completed`, with a distinct amber indicator.

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

26 paths. All `/api/*` routes except registration and login require a bearer token.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | none | Service name, version, status |
| GET | `/metrics` | none | Prometheus exposition |
| POST | `/api/auth/register` | none | Create account, returns token |
| POST | `/api/auth/login` | none | OAuth2 password form, returns token |
| POST | `/api/auth/admin-login` | none | Admin login variant |
| GET | `/api/auth/users` | user | List users (self-scoped for non-admins) |
| POST | `/api/workflows/` | user | Create workflow, schedules background pipeline |
| GET | `/api/workflows/` | user | Paginated workflow list |
| GET | `/api/workflows/{id}` | user + owner | Single workflow |
| DELETE | `/api/workflows/{id}` | user + owner | Delete workflow (explicit rollback on failure) |
| GET | `/api/reports/` | user | Paginated report list |
| GET | `/api/reports/{id}` | user + owner | Single report |
| DELETE | `/api/reports/{id}` | user + owner | Delete report |
| GET | `/api/reports/{id}/export/pdf` | user + owner | PDF via reportlab |
| GET | `/api/reports/{id}/export/docx` | user + owner | DOCX via python-docx |
| GET | `/api/dashboard/overview` | user | Six headline metrics — cached 30s |
| GET | `/api/dashboard/sentiment` | user | Sentiment distribution — cached 30s |
| GET | `/api/dashboard/trends` | user | Sentiment grouped by source — cached 30s |
| GET | `/api/dashboard/keywords` | user | Top 20 keywords — cached 30s |
| GET | `/api/dashboard/competitors` | user | Competitor analysis — cached 30s |
| GET | `/api/dashboard/recent-activity` | user | 5 most recent workflows — **never cached** |
| POST | `/api/schedules/` | user | Create schedule (stored, not executed) |
| GET | `/api/schedules/` | user | List own schedules |
| DELETE | `/api/schedules/{id}` | user + owner | Deactivate own schedule |
| POST | `/api/rag/index` | user | Index documents into ChromaDB |
| POST | `/api/rag/query` | user | Similarity search |
| GET | `/api/monitoring/health` | user | Health probe |
| GET | `/api/monitoring/system` | user | psutil system stats |
| GET | `/api/monitoring/agents` | user | Agent execution stats |
| GET | `/api/admin/users` | admin role | **Stub — returns `[]`** |
| GET | `/api/admin/stats` | admin role | **Stub — returns `{"status": "ok"}`** |

---

## Performance Characteristics

### Known Bottlenecks

| Bottleneck | Root cause | Status |
|---|---|---|
| Slow dashboard load | `get_overview_metrics` issued six sequential `await db.execute()` calls — six round-trips per load | **Fixed** — folded into one SELECT of scalar subqueries |
| Slow queries across the board | No indexes on `user_id`, `workflow_id`, `metric_type`; every dashboard query was a full table scan | **Fixed** — 9 indexes added |
| Indexes never actually applied | `create_all` skips existing tables, so newly declared indexes were silently ignored on a live DB | **Fixed** — `init_db` now creates missing indexes explicitly |
| Heavy cost on every authenticated request | `User` relationships were `lazy="selectin"`, so loading the current user eager-loaded that user's entire reports, workflows, and agent_logs | **Fixed** — changed to `lazy="select"` |
| N+4 queries on the workflow list | `Workflow` relationships were `lazy="selectin"` — 3 extra SELECTs per workflow row | **Fixed** — changed to `lazy="select"` |
| Redundant dashboard fetches on mount | Two chained `useEffect`s, the second keyed on `[selectedWorkflowId, workflows.length]`, both firing during mount | **Fixed** — single init effect plus a ref-guarded selection effect |
| UI hangs on a stalled backend | axios had no timeout | **Fixed** — 30s timeout |
| Workflow polling churn | 10s interval | **Fixed** — 15s (cleanup was already correct) |
| Large frontend bundle (~668 KB, ~202 KB gzipped) | Everything in one chunk; recharts is the bulk | **Open** — needs route-level code splitting |
| Gemini latency dominates workflow runtime | 2 sequential LLM calls per run, each seconds long | **Open by design** — inherent to the pipeline |

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

1. `POST /api/auth/register` or `/login` verifies credentials with bcrypt.
2. The server issues an HS256 JWT signed with `JWT_SECRET_KEY`, expiring after
   `ACCESS_TOKEN_EXPIRE_MINUTES` (default 30).
3. The browser stores the token in `localStorage`, and an axios request interceptor attaches it as
   `Authorization: Bearer <token>`.
4. `get_current_user` decodes and validates the token per request and loads the `User` row.
   `require_role("admin")` layers a role check on top for admin routes.
5. An axios response interceptor catches any `401`, clears `localStorage`, and redirects to `/login`.

**There is no refresh token.** When the 30-minute JWT expires the user is bounced to the login
screen mid-session, losing whatever they were doing. `localStorage` also means the token is readable
by any successful XSS. Both are documented as future work below.

### Input Sanitization

`backend/app/core/sanitizer.py` provides two functions, both confirmed wired in:

- **`sanitize_query(query)`** — called in `POST /api/workflows/` (`workflows.py:25`) *before* the
  query is persisted or handed to the background task. Strips prompt-injection patterns and returns
  the cleaned query plus a list of warnings. The sanitized value overwrites the raw one, so the
  unsanitized string never reaches the database or the pipeline.
- **`safe_query_for_prompt(query)`** — a second defence applied where the query is interpolated into
  an LLM prompt, in both `insight_agent.py:17` and `report_agent.py:18`.

`extract_json()` in the same module defensively parses Gemini responses that arrive wrapped in
markdown fences or with trailing prose.

---

## Known Issues & Future Work

### High Priority

1. **No test suite.** `backend/tests/` does not exist. `pytest` and `pytest-asyncio` are already in
   `requirements.txt` but unused. This is the single largest risk to the project — every change is
   verified manually.
2. **No refresh token.** A 30-minute expiry with a hard redirect to `/login` will interrupt a
   demo mid-flow. Either implement refresh tokens or raise the expiry for demo runs.
3. **Bluesky needs credentials or it silently mocks.** `BLUESKY_IDENTIFIER` and
   `BLUESKY_APP_PASSWORD` must be set in `.env`, otherwise the source produces mock data with only a
   log line to indicate it. Same for `NEWSDATA_API_KEY` and `GUARDIAN_API_KEY`.
4. **Alembic is configured but unused.** `backend/alembic/versions/` contains no migrations; the
   schema is created by `Base.metadata.create_all`. Because `create_all` skips existing tables,
   *any future column addition will not be applied to a live database* — `init_db` now handles
   missing indexes, but not missing columns. A real migration is required before the next schema
   change.

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
8. **Frontend bundle is one ~668 KB chunk.** Route-level `React.lazy` around the Recharts-heavy
   Dashboard and Reports pages would cut the initial payload substantially.
9. **SQLite/Postgres split.** `config.py` falls back to `sqlite+aiosqlite:///./agentflow.db` when
   `DATABASE_URL` is unset. Convenient locally, but it means local behaviour can diverge from
   production Postgres (type coercion, concurrency). Fine as long as it stays a documented dev-only
   fallback.

### Low Priority / Nice to Have

10. **`GRAFANA_PORT=3001` in `.env.example` is unreferenced.** `docker-compose.yml` hardcodes
    `3000:3000`. Harmless but misleading — either wire the variable through or drop it.
11. **`REDDIT_USER_AGENT=AgentFlow/1.0`** still carries the old project name. It is a functional
    identifier sent to Reddit, so it was deliberately left alone rather than renamed.
12. **`frontend/src/assets/hero.png` (16 KB) is unreferenced.** Left in place because it is a real
    asset rather than framework scaffold, and may be intended for future use.
13. **`docker-compose.yml` still declares `version:`**, which Compose v2 warns is obsolete.
14. **Bundle warns about an ineffective dynamic import** — `client.ts` is both statically and
    dynamically imported, so the dynamic import in `Reports.tsx` does not split anything.

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

Touch points are narrow: `insight_agent.py`, `report_agent.py`, `rag/embeddings.py`, and the startup
configure call in `main.py`. Estimated effort **half a day**, most of it re-testing the two LLM nodes
and their fallback paths. Worth doing before the deprecated package stops receiving security fixes.

### Specific Future Work: Test Suite

`backend/tests/` does not exist. Recommended order, highest value first:

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
5. **Auth flow** — register → login → authenticated request → expired token, via
   `fastapi.testclient.TestClient`, which also exercises the lifespan handler.
6. **Cleaning agent** — URL stripping, special-character handling, and the English heuristic.

Start with 1–3: they need no database and no network, so they can run in CI immediately.

### Specific Future Work: Reddit API

Reddit API access has been requested and is **awaiting approval**. Until credentials land,
`RedditScraper` degrades in two steps: it first tries the keyless public JSON search endpoint
(`reddit.com/search.json`) with a browser user-agent, and only falls back to generated mock posts if
that also fails. This means Reddit often returns genuine data even with no credentials configured,
though the public endpoint is rate-limited and unsupported for production use.

Once `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` are approved and set, PRAW takes over and
searches a fixed list of product/technology subreddits, collecting both submissions and their top
five comments per post.
