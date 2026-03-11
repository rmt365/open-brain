# Open Brain - Personal Knowledge Management Service

## Overview

| Attribute | Value |
|-----------|-------|
| **Port** | 3012 |
| **Database** | `open-brain.db` |
| **Technology** | Deno + Hono + SQLite + VSS |
| **Entry Point** | `open-brain/src/main.ts` |

Open Brain is an MCP-native personal knowledge management service that captures thoughts, notes, ideas, tasks, questions, observations, decisions, references, and reflections. It enriches each captured thought with AI-assigned classification (type + topics) and 384-dimensional vector embeddings for semantic search. The service degrades gracefully — thoughts are always stored even if the LLM provider or embedding service is unavailable.

Open Brain can run standalone (with its own docker-compose including Ollama) or as part of the P2B platform behind Platform's proxy. As an MCP-native knowledge service, it is designed to work directly with MCP-compatible AI clients without requiring Platform orchestration.

---

## Invariants (DO NOT BREAK)

1. **Capture Always Succeeds** — `POST /thoughts` must ALWAYS store the thought text in SQLite, even if LLM classification and/or embedding generation fail. Classification and embedding are async enhancements, not gatekeepers. A null classification or null embedding is acceptable; a lost thought is not.

2. **384-Dimensional Embeddings** — VSS table uses `embedding(384)`. The `all-minilm` Ollama model produces 384-dim vectors. Changing to a different-dimensioned model requires rebuilding the entire VSS index. Never change the embedding model without a migration plan.

3. **Graceful Degradation** — Both `classifyThought()` and `generateEmbedding()` return null on failure (network error, timeout, service down). Callers must handle null gracefully. The system operates in degraded mode (no auto-type, no semantic search) rather than failing.

4. **Auth Middleware Skip Paths** — These paths MUST skip API key authentication: `/health`, `/manifest`, `/ui/*`, and `OPTIONS` requests (CORS preflight). Breaking this blocks health checks, service discovery, PWA loading, and cross-origin browser requests.

5. **BASE_PATH Injection** — When `BASE_PATH` is set (e.g., `/open-brain` for P2B proxy mode), ALL UI asset paths, fetch URLs, manifest URLs, and service worker registrations must use it as prefix. When empty (standalone mode), no prefix. The browser reads `window.__BASE_PATH` injected by the server into the HTML template.

6. **LLM Provider Abstraction** — The classifier accepts any `LLMProvider` interface implementation. Adding a new provider requires only implementing `complete(system, user, model?): Promise<string | null>` and adding it to the factory. Never hardcode a specific provider in business logic.

7. **Ollama URL Shared** — Both embedding generation and the Ollama LLM provider share the same `OLLAMA_URL` config. Do not add separate URL configs for the same Ollama instance.

8. **Semantic Search: Single-Query Pattern** — `semanticSearch()` uses `vssSearchWithThoughts()` which fetches full thought rows in a single SQL query (JOIN on VSS results). Never revert to per-result `getThought()` calls — that's an N+1 problem (up to 60 individual SELECTs per search). The old `vssSearch()` method (IDs only) is kept for potential lightweight callers but must not be used in the search path.

9. **Batch Concurrency Bounds** — `processUnembedded()` runs with concurrency 5 (embedding calls to Ollama). `processUnclassified()` runs with concurrency 3 (LLM classification calls, heavier). These limits prevent overwhelming Ollama/Anthropic. Do not increase without load testing. Both use `processInChunks()` with `Promise.allSettled` — individual failures never abort the batch.

10. **processInChunks Error Isolation** — Each item in a batch processes independently via `Promise.allSettled`. A thrown exception or false return from one item increments the `failed` counter but does not prevent other items in the same chunk or subsequent chunks from processing. This is critical for batch resilience.

---

## API Tools

Tools exposed via `/manifest` endpoint for workflow orchestration:

| Tool | Method | Endpoint | Description |
|------|--------|----------|-------------|
| `open-brain.thought.capture` | POST | `/thoughts` | Capture a new thought, note, idea, or observation |
| `open-brain.thought.get` | GET | `/thoughts/{thought_id}` | Get a specific thought by ID |
| `open-brain.thought.list` | GET | `/thoughts` | List thoughts with optional filtering by type, topic, channel, and date |
| `open-brain.thought.update` | PUT | `/thoughts/{thought_id}` | Update a thought's content, type, topic, or status |
| `open-brain.thought.search` | POST | `/thoughts/search` | Semantically search thoughts using natural language query |
| `open-brain.stats` | GET | `/thoughts/stats` | Get brain statistics: counts by type/channel, embedding coverage |

### Additional Endpoints (not in manifest)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/manifest` | Service manifest |
| GET | `/thoughts/topics` | Topic list with thought counts |
| POST | `/thoughts/{id}/reclassify` | Re-run AI classification for an existing thought |
| DELETE | `/thoughts/{id}` | Soft-delete a thought (sets status to `deleted`) |

---

## Database Schema

### Tables

#### `thoughts`

The single table for all thought data.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Primary key (UUID) |
| `text` | TEXT NOT NULL | The thought content |
| `thought_type` | TEXT | User-supplied type (`note` default) |
| `topic` | TEXT | Optional user-supplied topic/category |
| `source_channel` | TEXT | Capture channel (`api` default) |
| `auto_type` | TEXT | AI-assigned thought type |
| `auto_topics` | TEXT | JSON array of AI-assigned topics (up to 5) |
| `confidence` | REAL | AI classification confidence (0.0–1.0) |
| `embedding` | BLOB | 384-dim float32 vector (raw bytes) |
| `embedding_model` | TEXT | Embedding model name (`all-MiniLM-L6-v2` default) |
| `_vss_rowid` | INTEGER | Stable rowid for VSS virtual table (UNIQUE) |
| `status` | TEXT | `active` (default), `archived`, `deleted` |
| `metadata` | TEXT | JSON blob for additional context |
| `created_at` | DATETIME | Created timestamp |
| `updated_at` | DATETIME | Updated timestamp (auto-managed by trigger) |

#### VSS Virtual Table: `vss_thoughts`

Created at startup if the VSS extensions are available. Not part of the SQL migration — created programmatically via `db.createVSSTable()`.

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS vss_thoughts USING vss0(embedding(384))
```

Rows in `vss_thoughts` are keyed by `thoughts._vss_rowid`. The `storeEmbedding()` method automatically upserts the VSS entry after writing to the main table.

### Thought Types

| Value | Description |
|-------|-------------|
| `note` | General note (default) |
| `idea` | Creative idea or proposal |
| `task` | Action item or to-do |
| `question` | Open question |
| `observation` | Observed fact or pattern |
| `decision` | A decision made |
| `reference` | External resource or link |
| `reflection` | Introspective or retrospective thought |

### Source Channels

| Value | Description |
|-------|-------------|
| `cli` | Captured via command-line tool |
| `web` | Captured via web UI (PWA chat) |
| `api` | Captured via REST API (default) |
| `mcp` | Captured via MCP tool |
| `chat` | Captured via chat interface |
| `import` | Bulk imported |
| `telegram` | Captured via Telegram bot |

### Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_thoughts_thought_type` | `thought_type` | Filter by type |
| `idx_thoughts_source_channel` | `source_channel` | Filter by channel |
| `idx_thoughts_status` | `status` | Filter by status |
| `idx_thoughts_created_at` | `created_at` | Sort by date |
| `idx_thoughts_topic` | `topic` | Filter by topic |
| `idx_thoughts_vss_rowid` | `_vss_rowid` (UNIQUE) | VSS rowid lookup |

### Triggers

| Trigger | When | What it does |
|---------|------|-------------|
| `thoughts_assign_vss_rowid` | AFTER INSERT (when `_vss_rowid` is NULL) | Auto-assigns a stable incrementing rowid for VSS |
| `thoughts_update_timestamp` | AFTER UPDATE | Sets `updated_at = CURRENT_TIMESTAMP` |

---

## Key Files

| File | Purpose |
|------|---------|
| `src/main.ts` | Entry point, bootstraps service with Litestream support |
| `src/server.ts` | Hono HTTP server, middleware (logging, CORS), route mounting |
| `src/api/manifest.ts` | Service manifest (tools, resources, events, permissions) |
| `src/config.ts` | `ServiceConfig` and `readRawConfig()` |
| `src/types/index.ts` | TypeScript type definitions (Thought, SearchResult, BrainStats, etc.) |
| `src/schemas/schemas.ts` | Zod validation schemas for request bodies |
| `src/routes/thoughts.ts` | Route handlers for capture, list, get, update, delete, search, reclassify, stats, topics |
| `src/logic/thoughts.ts` | `ThoughtManager` — orchestrates capture flow, search, CRUD, stats |
| `src/logic/embeddings.ts` | Ollama `/api/embed` client (384-dim vectors) |
| `src/logic/classifier.ts` | LLM-based thought classification (via LLMProvider) |
| `src/logic/llm/types.ts` | LLMProvider interface |
| `src/logic/llm/anthropic-provider.ts` | Anthropic SDK provider |
| `src/logic/llm/ollama-provider.ts` | Ollama chat provider |
| `src/logic/llm/factory.ts` | Provider factory |
| `src/middleware/auth.ts` | API key auth middleware |
| `src/db/openBrainDatabaseManager.ts` | Database manager (extends `BaseDatabaseManager`), VSS index management |
| `src/db/migrations/sql/001_init_schema.sql` | Initial schema: `thoughts` table, indexes, triggers |
| `src/prompts/thought-classification.yaml` | Classification prompt template (PromptLoader, hot-reload) |
| `src/ui/routes.ts` | UI routes (PWA chat page, static files, manifest, service worker) |
| `src/ui/static/js/components/open-brain-chat.js` | Lit web component for PWA chat interface |
| `src/ui/static/sw.js` | Service worker (cache-first static, network-first API, offline queuing) |

---

## Inter-Service Communication

### Open Brain Depends On

| Service | Purpose | Graceful on failure? |
|---------|---------|----------------------|
| **Ollama** | Generate 384-dim embeddings via `POST /api/embed`; optionally LLM via `POST /api/chat` | Yes — thought stored without embedding |
| **Anthropic API** | Classify thought type and extract topics via SDK (default LLM provider) | Yes — thought stored without classification |

### Services That Use Open Brain

| Service | Usage |
|---------|-------|
| **open-brain-mcp** | MCP server proxy — provides 6 tools backed by this HTTP API |
| **open-brain-telegram** | Telegram bot — captures thoughts, searches, lists recent via HTTP |
| **Platform** | Workflow orchestration via manifest tools, PWA proxied via `/:service/*` |

### API Calls Made by This Service

```typescript
// Embedding — Ollama
POST http://ollama:11434/api/embed
Body: { model: "all-minilm", input: "thought text" }
Response: { embeddings: [[...384 floats...]] }

// Classification — Anthropic SDK (via LLMProvider abstraction)
// No direct HTTP call — uses Anthropic SDK messages.create()
// LLMProvider interface abstracts over Anthropic and Ollama backends
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3012` | HTTP server port |
| `DATABASE_PATH` | `/app/database/open-brain.db` | SQLite database path |
| `LLM_PROVIDER` | `anthropic` | LLM provider (`anthropic` or `ollama`) |
| `ANTHROPIC_API_KEY` | _(required for anthropic)_ | Anthropic API key |
| `AI_MODEL` | `claude-haiku-4-5-20251001` | Model for thought classification |
| `OLLAMA_URL` | `http://ollama:11434` | Ollama server URL (embeddings + optional LLM) |
| `EMBEDDING_MODEL` | `all-minilm` | Ollama embedding model (384-dim) |
| `BASE_PATH` | _(empty)_ | URL prefix for Platform proxy mode (e.g. `/open-brain`) |
| `OPEN_BRAIN_API_KEY` | _(empty)_ | API key for Bearer token auth (empty = no auth) |

---

## Standalone Deployment

Open Brain can run independently with its own docker-compose:

```bash
cd open-brain
cp .env.example .env   # fill in ANTHROPIC_API_KEY
docker compose up -d --build

# Pull the embedding model (first time only)
docker exec open-brain-ollama-1 ollama pull all-minilm

# Access PWA
open http://localhost:3012/ui/brain

# MCP endpoint
http://localhost:3013/mcp
```

The standalone compose includes: Open Brain, MCP server, Telegram bot, and Ollama.
For P2B mode, set `BASE_PATH=/open-brain` and the service works behind Platform's proxy.

---

## Authentication

API key auth via `OPEN_BRAIN_API_KEY` env var. When set, all `/thoughts/*` and `/stats` endpoints require `Authorization: Bearer <key>`. Public endpoints (`/health`, `/manifest`, `/ui/*`) are always accessible.

When no API key is configured, auth is disabled (local dev mode).

PWA stores the API key in localStorage and includes it automatically. First 401 response shows a key input dialog.

---

## Common Operations

### Capture a Thought

```bash
curl -X POST http://localhost:3012/thoughts \
  -H "Content-Type: application/json" \
  -d '{
    "text": "We should use event sourcing for the audit trail",
    "thought_type": "idea",
    "topic": "architecture",
    "source_channel": "api"
  }'
```

Response:
```json
{
  "success": true,
  "message": "Thought captured",
  "data": {
    "id": "a1b2c3...",
    "text": "We should use event sourcing for the audit trail",
    "thought_type": "idea",
    "topic": "architecture",
    "auto_type": "idea",
    "auto_topics": ["architecture", "event-sourcing", "audit"],
    "confidence": 0.92,
    "has_embedding": true,
    "status": "active",
    "created_at": "2026-03-03T12:00:00Z"
  }
}
```

### Semantic Search

```bash
curl -X POST http://localhost:3012/thoughts/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "event sourcing and audit logs",
    "limit": 5
  }'
```

### List Thoughts (Filtered)

```bash
# Recent ideas about architecture
curl "http://localhost:3012/thoughts?type=idea&topic=architecture&limit=20"

# All tasks
curl "http://localhost:3012/thoughts?type=task&status=active"

# Captured via MCP in last 7 days
curl "http://localhost:3012/thoughts?channel=mcp&since=2026-02-24T00:00:00Z"
```

### Get Stats

```bash
curl http://localhost:3012/thoughts/stats
```

Response:
```json
{
  "success": true,
  "data": {
    "total_thoughts": 142,
    "by_type": { "idea": 45, "note": 38, "task": 29, "question": 18, "observation": 12 },
    "by_channel": { "mcp": 89, "api": 32, "chat": 21 },
    "embedded_count": 138,
    "classified_count": 140,
    "oldest_thought": "2026-01-15T09:23:00Z",
    "newest_thought": "2026-03-03T11:58:00Z"
  }
}
```

### List Topics

```bash
curl http://localhost:3012/thoughts/topics
```

### Reclassify a Thought

```bash
curl -X POST http://localhost:3012/thoughts/a1b2c3.../reclassify
```

### Soft-Delete a Thought

```bash
curl -X DELETE http://localhost:3012/thoughts/a1b2c3...
```

### Health Check

```bash
curl http://localhost:3012/health
# Response: { "status": "healthy", "service": "open-brain", "timestamp": "..." }
```

---

## Graceful Degradation

The capture flow is designed to always succeed even when dependencies are down:

| Scenario | Behavior |
|----------|----------|
| Ollama unavailable (embeddings) | Thought stored without embedding. `has_embedding: false`. Search falls back to text LIKE matching. |
| LLM provider unavailable (Anthropic/Ollama) | Thought stored without classification. `auto_type`, `auto_topics`, `confidence` remain null. |
| Both dependencies unavailable | Thought stored with text only. Full functionality restored when services recover (use `/reclassify` and batch re-embed). |
| VSS extensions not loaded | `vssSearch()` returns empty array. Search automatically falls back to keyword scoring (text LIKE). |

The `ThoughtManager.search()` method first attempts semantic VSS search and automatically falls back to keyword-scored text search when embedding is unavailable.

---

## MCP Server

The `open-brain-mcp` package (in `/home/robin/workspaces/P2B-Service/open-brain-mcp/`) is a standalone Node.js MCP server that wraps the Open Brain HTTP API for use with Claude Desktop and other MCP-compatible AI clients.

| Attribute | Value |
|-----------|-------|
| **Protocol** | MCP (stdio transport) |
| **Technology** | Node.js + TypeScript + `@modelcontextprotocol/sdk` |
| **Entry** | `open-brain-mcp/src/index.ts` |
| **Config** | `OPEN_BRAIN_URL` env var (default: `http://localhost:3012`), `OPEN_BRAIN_API_KEY` for auth |

### MCP Tools (6)

| Tool | Description |
|------|-------------|
| `capture_thought` | Capture a new thought, note, idea, question, or observation. Auto-classifies type and topics. |
| `search_brain` | Semantic search across all thoughts by meaning. Returns similarity-ranked results. |
| `browse_recent` | Browse recent thoughts chronologically. Filter by type, topic, or time window (default: last 7 days). |
| `find_related` | Find thoughts related to a given thought ID by semantic similarity. Excludes the source thought from results. |
| `list_topics` | List topics with thought counts ordered by frequency. Accepts `min_count` filter. |
| `brain_stats` | Get aggregated statistics: totals, breakdown by type/channel, embedding/classification coverage, date range. |

### Installation (Claude Desktop)

```json
{
  "mcpServers": {
    "open-brain": {
      "command": "node",
      "args": ["/path/to/open-brain-mcp/dist/index.js"],
      "env": {
        "OPEN_BRAIN_URL": "http://localhost:3012"
      }
    }
  }
}
```

---

## Capture Flow Detail

When `POST /thoughts` is called, `ThoughtManager.capture()` runs this sequence synchronously:

```
1. INSERT thought → DB (immediate, always succeeds)
2. POST /api/embed → Ollama (generates 384-dim vector)
   └── SUCCESS: UPDATE thoughts SET embedding, sync to vss_thoughts
   └── FAILURE: log warning, continue (has_embedding stays false)
3. Anthropic SDK messages.create() (classifies type + topics via LLMProvider)
   └── SUCCESS: UPDATE thoughts SET auto_type, auto_topics, confidence
   └── FAILURE: log warning, continue (auto_type stays null)
4. SELECT thought → DB (return final state to caller)
```

Note: Steps 2 and 3 are currently synchronous (awaited inline), so the API response is only returned after both complete or time out. A future improvement (OB-005) would make these non-blocking.

---

## VSS Index Architecture

The service maintains a VSS (vector similarity search) virtual table that mirrors embeddings from the `thoughts` table.

- `thoughts.embedding` — raw 384-dim float32 bytes (source of truth)
- `vss_thoughts.embedding` — VSS index keyed by `thoughts._vss_rowid`
- `thoughts._vss_rowid` — stable integer assigned by trigger on INSERT

After every `storeEmbedding()` call, `upsertVSSEmbedding()` syncs the new embedding to `vss_thoughts`. The full index can be rebuilt via `rebuildVSSIndex()` if it drifts.

VSS extensions are loaded from:
- `/usr/local/lib/sqlite3/extensions/vector0`
- `/usr/local/lib/sqlite3/extensions/vss0`

---

## PWA Chat Interface

A standalone mobile-first chat page for capturing thoughts. URL is configurable: standalone at `/ui/brain`, P2B mode at `{BASE_PATH}/ui/brain` (e.g. `/open-brain/ui/brain` via Platform proxy). Installable as PWA on mobile home screen.

| Attribute | Value |
|-----------|-------|
| **URL** | `/ui/brain` (standalone) or `{BASE_PATH}/ui/brain` (P2B mode) |
| **Component** | `<open-brain-chat>` (Lit web component) |
| **PWA** | Installable — manifest + service worker |

### Features

- Dark theme chat UI (deep indigo/purple)
- User bubbles right-aligned, system acknowledgments left-aligned with topic tags
- Captures via `POST /thoughts` with `source_channel: 'web'`
- Smart acknowledgment: "Got it — tagged as [type] about [topics]"
- Offline queuing: stores pending thoughts in localStorage, drains on reconnect
- Multi-user: `?user=Name` query param stored in metadata
- Message history persisted in localStorage (last 100)
- API key auth: settings button to enter key, stored in localStorage, sent as Bearer token on all requests
- 401 handling: shows API key input dialog prompting for key entry

---

## Telegram Bot

A Deno-based Telegram bot in its own Docker container (`open-brain-telegram`). Calls Open Brain REST API over HTTP. Uses grammY.

| Attribute | Value |
|-----------|-------|
| **Container** | `open-brain-telegram` |
| **Technology** | Deno + grammY |
| **Source** | `open-brain/telegram/` |
| **Config** | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USERS` |

### Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and command list |
| `/search <query>` | Semantic search, top 5 results with similarity % |
| `/recent` | List last 10 thoughts with dates |
| Plain text | Capture as thought with `source_channel: 'telegram'` |

### Security

Optional `TELEGRAM_ALLOWED_USERS` env var (comma-separated user IDs). If set, rejects unauthorized users.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | _(required)_ | Bot token from @BotFather |
| `OPEN_BRAIN_URL` | `http://open-brain:3012` | Open Brain service URL |
| `TELEGRAM_ALLOWED_USERS` | _(empty = all allowed)_ | Comma-separated Telegram user IDs |
| `OPEN_BRAIN_API_KEY` | _(empty)_ | API key passed as Bearer token to Open Brain |

---

## Backlog

See [BACKLOG.md](./BACKLOG.md) for tracked feature work, bugs, and improvements.
