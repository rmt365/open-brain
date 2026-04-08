# Open Brain - Backlog

Items use `OB-{NNN}` IDs. Status flow: `proposed` → `planned` → `in-progress` → `done`.

---

## Done

### OB-002: PWA Chat Interface

| Field | Value |
|-------|-------|
| **ID** | OB-002 |
| **Status** | done |
| **Completed** | Mar 3, 2026 |

Standalone mobile-first PWA chat at `/ui/brain`. Lit web component, dark theme, offline queuing, multi-user via `?user=Name`. Installable on mobile home screen.

---

### OB-006: Telegram Bot

| Field | Value |
|-------|-------|
| **ID** | OB-006 |
| **Status** | done |
| **Completed** | Mar 3, 2026 |

Deno-based Telegram bot using grammY. Captures text messages as thoughts, supports `/search` and `/recent` commands. Runs in own Docker container (`open-brain-telegram`). Configurable user whitelist.

---

## Active / In-Progress

### OB-017: Gardening Agents

| Field | Value |
|-------|-------|
| **ID** | OB-017 |
| **Status** | in-progress |
| **Priority** | critical |

**Rationale:** Robin's brain has 140 unapproved topic suggestions creating a "(no topic)" bottleneck. The treemap visualization is hollow without organized topics. This unblocks the explore page, search quality, and overall usability. See full spec below in Proposed section.

**Next up:** OB-018 (User-Configurable Life Areas + Onboarding) — needed before Tina starts using her brain instance.

---

## Planned

### OB-009: Independent Multi-Instance Production Deployment

| Field | Value |
|-------|-------|
| **ID** | OB-009 |
| **Status** | done |
| **Priority** | high |
| **Plan file** | `.claude/plans/melodic-swimming-mochi.md` |
| **Completed** | Mar 11, 2026 |

Deploy Open Brain as fully independent instances on the production droplet, decoupled from the P2B platform stack.

**Architecture:**
- Each person/purpose gets their own Docker compose project (own container, database, API key)
- All instances share one standalone Ollama (auto-pulls `all-minilm`, models externalized to survive restarts)
- Subdomain routing via existing Traefik (`robin.brain.cerulean.studio`, etc.)
- GHCR images built by GitHub Actions
- Litestream backup built into each instance automatically
- `ob-ctl.sh` management script for up/down/logs/status

**Initial instances:** `robin-brain`, `tfs-brain`, `cerulean-brain`, `tina-brain`

**Key decisions:**
- Separate installations per person (not multi-tenant with row-level isolation)
- Own Ollama, not shared with P2B stack
- Remove OB entries from P2B compose files (nothing in P2B depends on OB)
- Business knowledge (TFS processes, addresses, account numbers) uses same thought schema -- no code changes needed

**Scope:**
1. Parameterize MCP server port (`entrypoint.sh`)
2. Create standalone Ollama compose with auto-pull entrypoint
3. Create instance compose template with Traefik labels
4. Create Litestream config template
5. Create `.env` template + 4 instance configs
6. Create `ob-ctl.sh` management script
7. Remove OB from P2B `docker-compose.yml` and `docker-compose.production.yml`
8. Add 3 GHCR build jobs to `build-push.yml`
9. DNS: `*.brain.cerulean.studio` -> droplet IP
10. Update SERVICE.md and BACKLOG.md

**Subsumes:** OB-004 (Litestream) -- backup is built into the instance template

---

## Recently Done

### OB-008: Performance Optimizations (N+1 Search, Batch Concurrency)

| Field | Value |
|-------|-------|
| **ID** | OB-008 |
| **Status** | done |
| **Completed** | Mar 4, 2026 |

Eliminated N+1 query in semantic search and added bounded concurrency to batch reprocessing.

**Changes:**
- `vssSearchWithThoughts()` — single SQL query returns full thought rows + distance (replaces per-result `getThought()` loop, 1 query instead of up to 61)
- `semanticSearch()` rewritten to use new method — no behavior change, same response shape
- `processInChunks()` helper with `Promise.allSettled` for error-isolated concurrent processing
- `processUnembedded()` — concurrency 5 (was sequential)
- `processUnclassified()` — concurrency 3 (was sequential)
- 8 new behavior tests for `processInChunks` (concurrency bounds, partial failures, empty input, error isolation)
- 3 new invariants documented in SERVICE.md (#8, #9, #10)

---

### OB-007: Standalone Service Independence

| Field | Value |
|-------|-------|
| **ID** | OB-007 |
| **Status** | done |
| **Completed** | Mar 4, 2026 |

Removed dependencies on AI Gateway and BOW Processing. Open Brain now runs fully self-contained.

**Changes:**
- LLM: Direct Anthropic SDK via pluggable `LLMProvider` interface (factory supports Anthropic + Ollama)
- Embeddings: Ollama `all-minilm` model (384-dim, compatible with existing VSS data)
- Auth: API key via `OPEN_BRAIN_API_KEY` env var (Bearer token, optional)
- Config: Centralized `config.ts` with `readRawConfig()` from env vars
- UI: Configurable `BASE_PATH` for standalone vs P2B proxy mode
- Docker: Standalone `open-brain/docker-compose.yml` + updated P2B compose files
- MCP + Telegram: Pass API key as Bearer token
- Tests: 23 behavior tests (factory, classifier, auth middleware, config, embeddings)
- Invariants documented in SERVICE.md

---

## Proposed

### OB-001: Bulk Import (Notion, Apple Notes, text files)

| Field | Value |
|-------|-------|
| **ID** | OB-001 |
| **Status** | proposed |
| **Priority** | medium |

Allow importing thoughts in bulk from common note-taking tools and plain text.

**Scope:**
- Accept multiline text files (one thought per line, or paragraph-separated)
- Accept Notion export (Markdown or CSV)
- Accept Apple Notes export (text format)
- Set `source_channel: "import"` on all imported thoughts
- Batch embed and classify after import (background sweep)
- Return import summary (N captured, N failed)

**Acceptance criteria:**
- `POST /thoughts/import` with multipart or JSON body
- Duplicate detection by text hash (skip exact duplicates)
- Estimated time for 1000 thoughts: under 5 seconds for storage, embeds/classifies async

---

### OB-003: Topic Normalization and Deduplication

| Field | Value |
|-------|-------|
| **ID** | OB-003 |
| **Status** | proposed |
| **Priority** | low |

Topics are currently free-text strings (user-supplied and AI-assigned). Over time, similar topics accumulate as near-duplicates ("architecture", "system-architecture", "arch").

**Scope:**
- Admin endpoint to list all topics with counts
- Merge endpoint: `POST /thoughts/topics/merge` — re-assigns multiple topic values to a single canonical value
- Optional: AI-assisted deduplication suggestion (cluster similar topic strings)
- Affects both `topic` (user-supplied) and `auto_topics` (AI JSON array)

---

### OB-004: Litestream Backup Configuration

| Field | Value |
|-------|-------|
| **ID** | OB-004 |
| **Status** | proposed |
| **Priority** | medium |

Add Litestream continuous replication for `open-brain.db` to match the backup setup used by other services.

**Scope:**
- Add `ENABLE_LITESTREAM`, `WASABI_ENDPOINT`, `WASABI_BUCKET`, `WASABI_ACCESS_KEY_ID`, `WASABI_SECRET_ACCESS_KEY` env vars to Docker config
- Update `docker-compose.yml` service entry with the standard Litestream sidecar pattern
- Add to production backup documentation
- Test recovery procedure

**Notes:** The `main.ts` already imports from `@p2b/db-backup` (`bootstrapService`), so the service-level plumbing is in place. This is a config/ops task.

---

### OB-009: Open Brain as platform institutional knowledge module
**Status:** proposed
**Added:** Mar 9, 2026
**Priority:** High
**Origin:** Architecture discussion about skill-based intent routing. The platform needs an externalized knowledge store for business decisions, precedents, risk assessments, client-specific rules, and exceptions — rather than encoding this in platform code or skill documents. Open Brain is the natural home for this institutional knowledge.

**Context:** Open Brain currently operates as a standalone thought capture and retrieval service. This proposal extends it to serve as the platform's institutional knowledge layer — the place where business decisions, process knowledge, risk assessments, and exceptions live. Skills (PLAT-029) reference Open Brain for domain-specific context rather than hardcoding rules. This keeps the platform thin and makes business logic inspectable, editable, and auditable by humans.

**What Open Brain would hold (in addition to current thought capture):**

**Decisions** — "We decided that partner clients don't need agreements." Captured with context: who decided, when, why, what it applies to. Queryable by the LLM when evaluating governance rules at execution time.

**Process knowledge** — "When closing a deal with an enterprise client, legal review happens before invoicing." The understanding that informs whether a workflow is correct — not a workflow YAML (that's the codified optimization), but the reasoning behind it.

**Risk assessments** — "Sending an agreement to the wrong party type is a critical error. Merging projects is hard to reverse after outlines are generated." Judgments about consequence that inform execution caution levels.

**Precedents** — "Last time we onboarded a podcast network, we did X and it worked well" or "We tried auto-merging similar projects in January and it caused problems." Historical context that informs future decisions.

**Exceptions** — "Acme Corp has a custom billing arrangement — quarterly invoicing instead of per-project." The kind of thing that breaks generic workflows and can't be anticipated in skill documents.

**Validation feedback** — "The deal-closure workflow produced the correct result for this situation" (routing validation) and "This invoice was generated correctly" (outcome validation). Builds trust scores over time.

**How skills interact with Open Brain:**
```yaml
# In a skill document
context_queries:
  - ask: open-brain
    about: "agreement requirements for {party.type} clients"
    informs: "whether to include create_agreement step"
  - ask: open-brain
    about: "risk level for {action} on {resource}"
    informs: "confirmation requirements"
  - ask: open-brain
    about: "exceptions or special arrangements for {party.name}"
    informs: "workflow modifications"
```

**Availability and resilience:**
- Cache frequently-accessed decisions (client type rules, risk levels) so they don't require a query every time
- Skills contain sensible defaults that work without Open Brain enrichment, just more conservatively
- Fallback posture when Open Brain is unreachable: higher confirmation requirements, more cautious defaults
- Decision authority and provenance: not all entries are equal — source, role, and recency affect weight

**Data model requirements (append-only):**
- Decisions are never updated, only superseded — every entry has lineage (created by whom, when, why, supersedes what)
- "Rolling back" means marking the current decision as invalid and reinstating the previous one
- Full audit trail: who captured it, which skill consumed it, what action it influenced
- Gardener agents (PLAT-030) never delete — they propose superseding entries

**Decision capture sources:**
- User explicitly states a business rule in conversation → captured as decision
- User validates or corrects a workflow outcome → captured as validation feedback
- User flags an incorrect result → captured as precedent/correction
- Gardener agents propose merges or staleness → captured with gardener attribution
- Admin explicitly enters a rule via Open Brain UI → captured as decision

**Scope:**
- Extend Open Brain data model with decision types (decision, process, risk, precedent, exception, validation)
- Decision lineage and supersession tracking (append-only event log)
- Structured query API for skill context queries (not just semantic search — also filtered by decision type, entity, recency)
- Decision authority metadata (who captured, role, weight)
- Caching layer for frequently-accessed decisions
- Fallback behavior when unreachable
- Platform module integration (manifest, skills directory, service registration)
- Decision capture API (from conversation, from workflow validation, from admin UI)
- Provenance tracking (which skill consumed this decision, what action it influenced)

**Migration path from standalone to platform module:**
- Open Brain already has: thought capture, semantic search, classification, MCP interface, Telegram bot, PWA chat
- New: structured decision types, lineage tracking, skill context query API, platform module registration
- Existing thought capture continues to work — decisions are a new thought type with additional structured metadata
- The Telegram bot and PWA chat become additional capture channels for business decisions

**Depends on:** None (can begin independently; PLAT-029 consumes it)
**Blocks:** PLAT-029 (skills reference Open Brain for context), PLAT-030 (gardener agents maintain Open Brain consistency)

---

### OB-010: Knowledge-Core Extraction Audit (BoW + Open Brain + BoB)

| Field | Value |
|-------|-------|
| **ID** | OB-010 |
| **Status** | proposed |
| **Priority** | high |
| **Added** | Mar 20, 2026 |

Audit three codebases (BoW, Open Brain, BoB) to identify shared functionality for extraction into a `@cerulean/knowledge-core` package. Deliverable is a comparison document, not code changes.

**Systems:**
- **BoW (Body of Work)** — content corpus for authors. Most mature. Audio transcription, document ingestion, public/private queries, scoped token access.
- **Open Brain** — personal knowledge vault. Text/URL/document ingestion, MCP interface, SQLite per user.
- **BoB (Body of Business)** — organizational knowledge. Append-only, auditable, role-scoped writes. Not primary focus.

**Audit areas for each system:**
1. Ingestion adapters — input types, processing pipelines, code locations
2. Chunking strategy — splitting logic, per-chunk metadata, configurability
3. Embedding — model/service, call site, storage format
4. SQLite schema — full schema, partitioning, access control fields
5. Retrieval — end-to-end query flow, search implementation (vector/FTS/hybrid), response shape
6. MCP interface — exposed tools/resources, input/output shapes
7. Access control — read/write controls, partition/scope concepts

**Output:** Comparison matrix rating each area as IDENTICAL, SIMILAR, DIVERGENT, or UNIQUE. Flag product differences (preserve) vs accidental divergence (reconcile).

**Constraints:** Audit only — no code changes.

---

### OB-011: Adaptive Output Rendering System

| Field | Value |
|-------|-------|
| **ID** | OB-011 |
| **Status** | proposed |
| **Priority** | medium |
| **Added** | Mar 20, 2026 |

Build a presentation-hint-driven rendering system for knowledge query results. LLM returns a `presentation` hint with each response; a component registry renders the appropriate format.

**Presentation hints:** prose, table, cards, timeline, graph, mixed

**Architecture:**
- Decision layer: LLM returns `{ content, presentation, rationale }` with each query result
- Rendering layer: component registry maps hints to Lit web components (not React — per CLAUDE.md)
- Mode modulation: each component accepts `mode` prop (capture | conversation | structure) affecting density/interactivity

**Phased delivery:**
- Phase 1: ProseComponent, DataTableComponent, CardGridComponent
- Phase 2: TimelineComponent
- Phase 3: GraphComponent, Compositor (only when real use cases demand it)

**Requirements:**
- Standardized TypeScript interfaces per content type (ProseContent, TableContent, CardContent, TimelineContent)
- Every component handles loading, error, and empty states
- Fallback to prose when hint is missing or unrecognized

**Constraints:** Components do not fetch their own data. No coupling to knowledge-core data model — accept standardized content interfaces only.

---

### OB-012: Update, Versioning, and External Write System

| Field | Value |
|-------|-------|
| **ID** | OB-012 |
| **Status** | proposed |
| **Priority** | medium |
| **Added** | Mar 20, 2026 |

Implement three update scenarios: user updates to captured knowledge, re-ingestion of updated sources, and external party writes.

**Core principle:** Capture is additive. Updates are explicit and auditable. External writes are immutable from user's perspective.

**Scenario 1 — User updates:**
- CORRECTION: update in place, preserve previous value in versions
- REFINEMENT: new version marked as current, previous version retrievable
- EXTENSION: new capture linked via parent_id, both retrievable independently
- Version schema: source_id (groups versions), version number, is_current, update_type

**Scenario 2 — Source re-ingestion:**
- Identify existing chunks by source_id, delete old set atomically, ingest fresh
- No chunk-level diffing — replace as unit

**Scenario 3 — External writes:**
- External parties write to designated partition only
- Records are immutable — user cannot edit, only read or revoke access
- Every external write logged (who, what, when, access token used)
- Revoking access does not delete existing records

**API endpoints:** PATCH /knowledge/:id, POST /knowledge/:id/extend, POST /knowledge/sources/:source_id/reingest, POST/GET/DELETE for partition records and access

**Audit trail:** Append-only log of all writes. Never deleted or updated.

**UI components needed:** DiffView, VersionHistory, ExternalRecordCard, AuditLog

**Depends on:** OB-011 (rendering components)

---

### OB-013: Grant Management System

| Field | Value |
|-------|-------|
| **ID** | OB-013 |
| **Status** | proposed |
| **Priority** | medium |
| **Added** | Mar 20, 2026 |

Build a conversational grant management system for controlling external access to the vault. All grant management happens through the chat interface — no separate admin panel.

**Core principle:** User is sole authority. Grants are explicit, scoped, and revocable. No OAuth. User directly issues tokens with defined manifests.

**Four tools (chat-only, never exposed to external parties):**
- `issue_grant` — create signed token with embedded tool manifest (displayed once only)
- `list_grants` — all active grants with scope and usage summary (renders as CardGrid)
- `check_usage` — audit trail for specific grant or party (renders as Timeline)
- `revoke_grant` — invalidate token, preserve audit history and written records

**Confirmation flow:** All state-changing operations (issue, revoke) require explicit user confirmation via LLM before execution.

**Token security:**
- HMAC-SHA256 signed tokens with embedded manifest
- Server validates signature AND manifest on every request
- Raw token never stored — issued once at creation, lost = revoke and reissue
- Expiry enforced at request time

**LLM routing:** System prompt includes example intents for issue, list, check usage, and revoke patterns.

**Depends on:** OB-012 (external write system, audit trail), OB-011 (rendering components)

---

### OB-005: Background Async Classification (Non-blocking Capture)

| Field | Value |
|-------|-------|
| **ID** | OB-005 |
| **Status** | proposed |
| **Priority** | low |

Currently `ThoughtManager.capture()` awaits both embedding (Ollama) and classification (Anthropic SDK) before returning to the caller. If either service is slow, the API call blocks.

**Scope:**
- Store thought immediately and return 201 response
- Fire embedding and classification as background tasks (using `Promise.allSettled` without awaiting in the request handler, or via a job queue)
- Add `GET /thoughts/{id}/status` or include a `processing` flag in the response to let callers poll
- Batch re-processing endpoints already exist (`processUnembedded`, `processUnclassified`) — ensure they're exposed via API

**Trade-off:** Caller won't receive classification in the immediate response. For MCP use (via `capture_thought`), this is acceptable since the tool output is informational.

---

### OB-014: Backup Health Indicator

| Field | Value |
|-------|-------|
| **ID** | OB-014 |
| **Status** | proposed |
| **Priority** | high |
| **Added** | Mar 22, 2026 |

Visible backup health stoplight in the PWA header, powered by a new health endpoint.

**Scope:**
- `GET /health/backup` endpoint — checks Litestream replication status and/or S3 object last-modified timestamp
- Returns: `{ status: "healthy" | "lagging" | "failing", last_replication: ISO timestamp, size_bytes: number }`
- Stoplight indicator in header of all pages (chat, browse, explore): green (< 5min), yellow (5-30min), red (30min+ or not running)
- Hover/tap tooltip shows last backup time and DB size
- Graceful when `ENABLE_LITESTREAM=false` — show gray dot with "backups disabled"

**Applies to:** All brain types (OB, BoB, BoW)

---

### OB-015: Backup Restore Verification

| Field | Value |
|-------|-------|
| **ID** | OB-015 |
| **Status** | proposed |
| **Priority** | medium |
| **Added** | Mar 22, 2026 |
| **Depends on** | OB-014 |

Periodic and on-demand restore testing to verify backups are actually recoverable.

**Scope:**
- `POST /admin/backup/test-restore` endpoint (admin-only)
- Pulls latest backup from S3 to temp location
- Opens as separate SQLite connection (never touches live DB)
- Runs validation: row counts, latest thought exists, schema version matches, `PRAGMA integrity_check`
- Returns pass/fail with details (row count comparison, schema version, integrity result)
- Results logged (system health log or dedicated table)
- Triggerable from UI (button on setup/admin page) or MCP tool
- Scheduled option: gardening agent runs weekly, alerts on failure

**Future (Cerulean ops):**
- Multi-instance dashboard showing backup and restore test status for all managed brains
- Alerting on failures (email, Slack, Telegram)

**Applies to:** All brain types (OB, BoB, BoW)

---

### OB-016: Summary-First URL Ingestion

| Field | Value |
|-------|-------|
| **ID** | OB-016 |
| **Status** | proposed |
| **Priority** | high |
| **Added** | Mar 22, 2026 |

When ingesting a URL, store an AI-generated summary as the thought's primary text instead of the raw scraped content.

**Current behavior:** Full page content stored as `text`, chunked and embedded verbatim. Results in walls of scraped text with nav elements and boilerplate in search results.

**Proposed behavior:**
1. Fetch full page content (same as now)
2. Generate AI summary: 3-5 key takeaways, why it matters, lessons/implications
3. Store summary as the thought's `text` — what appears in search, browse, treemap
4. Archive full text in `metadata.full_text` or cold storage (S3) — retrievable if needed
5. Embed the summary (not the raw article) — better search relevance
6. Keep `source_url` — original always one click away

**Why:** Matches how human memory works. Users don't re-read articles — they want takeaways. Produces better search results, better embeddings, better context for LLM agents.

**Applies to:** URL ingestion in all brain types. Document ingestion (OCR) already produces a structured extraction — similar principle.

---

### OB-017: Gardening Agents

| Field | Value |
|-------|-------|
| **ID** | OB-017 |
| **Status** | proposed |
| **Priority** | high |
| **Added** | Mar 22, 2026 |

Background agents that autonomously maintain data quality: topic management, consolidation, and backup verification.

**Sub-agents:**

**Topic gardener:**
- Auto-approve topic suggestions appearing 3+ times with consistent naming
- Auto-merge duplicate/near-duplicate topics (cosine similarity on names)
- Auto-assign life/business areas to topics based on constituent thoughts
- Weekly digest to user: "Added 5 topics, merged 2 duplicates"

**Consolidation gardener:**
- Identify old, unaccessed, large-text thoughts (especially ingested content)
- Generate condensed summary, archive original to cold storage
- Replace text and re-embed with summary
- Never consolidate recently accessed, starred, or user-marked-important thoughts
- Reversible — user can expand to retrieve original

**Different rules per brain type:**
- OB: relaxed — auto-approve, auto-merge, surface summary
- BoB: cautious — propose changes, owner approves structural changes, all actions logged
- BoW: TBD — likely similar to OB with publication-awareness

**Implementation options:** Scheduled Deno task (cron), background worker, or MCP tool triggered on schedule. TBD.

**Depends on:** OB-003 (topic normalization), OB-016 (summary-first ingestion for consolidation model)

---

### OB-018: User-Configurable Life Areas with Onboarding

| Field | Value |
|-------|-------|
| **ID** | OB-018 |
| **Status** | proposed |
| **Priority** | medium |
| **Added** | Mar 22, 2026 |

Replace hardcoded life area enum with user-configurable areas seeded by rational defaults and an optional onboarding interview.

**Current state:** 9 hardcoded life areas in `LifeAreaSchema` (craft, business, systems, health, marriage, relationships, creative, wild, meta). These are Robin-specific and don't generalize.

**Proposed OB defaults:** work, business, technology, health, family, people, creative, aspirations, growth

**Proposed BoB defaults:** operations, sales, customers, team, finance, legal, products, vendors

**Onboarding interview:** 5-6 questions on first use ("What do you do for work? What matters outside work? What are you trying to improve?"). Map answers to areas, let user rename/add/remove. System picks defaults, user tweaks.

**Scope:**
- Move life areas from schema enum to a user-configurable table (or preference/config artifact)
- Seed with defaults on first use
- UI for managing areas (add, rename, reorder, archive)
- Onboarding flow in PWA (optional, skippable)
- Migration: map existing hardcoded areas to the new configurable set
- Classifier updated to use the user's configured areas instead of the enum

---

### OB-019: Priority-Based Preference Loading

| Field | Value |
|-------|-------|
| **ID** | OB-019 |
| **Status** | proposed |
| **Priority** | medium |
| **Added** | Mar 23, 2026 |

Add a priority field to preferences and config artifacts that controls when they're injected into LLM context. Inspired by the "Memory Dashboard" pattern of grouping memories by load priority.

**Priority levels:**
- **P1 (Always):** Injected into every LLM context. Hard guardrails, communication style, core rules. Default for new preferences.
- **P2 (Relevant):** Injected when domain/topic matches. Project configs, domain-specific rules. Default for new config artifacts.
- **P3 (On-demand):** Available via search/browse only, never auto-injected. Reference material, archived guidelines.

**Scope:**
- Add `priority` column to `preferences` and `config_artifacts` tables
- Update `assemblePreferencesBlock()` to filter by priority (P1 always, P2 when domain matches, P3 never)
- Update context injector in MCP to respect priority levels
- UI: group preferences by priority level with section headers ("Always Active", "When Relevant", "Reference Only")
- MCP tools: add optional `priority` param to capture/config actions
- Gardener enhancement: suggest demoting unused preferences to P3

**Impact:** Reduces context window noise from ~2000 tokens (everything) to ~500 tokens (P1 only) for typical tool responses. Improves LLM output quality.

**Design doc:** `.claude/plans/radiant-skipping-rabbit.md` (full design with schema, assembly logic, UI mockups)

---

### OB-020: Richer Thought Types for Real-World Capture

| Field | Value |
|-------|-------|
| **ID** | OB-020 |
| **Status** | done |
| **Priority** | high |
| **Added** | Apr 8, 2026 |
| **Completed** | Apr 8, 2026 |

Expand `ThoughtType` with domain-specific types and wire up document extraction so the detected document type maps directly to the thought type. Zero-decision capture: send a receipt, it becomes an `expense`; send a lease, it becomes a `contract`.

**New types:**
- `expense` — receipts, bills, invoices, any payment record
- `contract` — leases, agreements, signed documents
- `maintenance` — repairs, service records, paint colors, property info, appliance history
- `insurance` — policies, pink slips, coverage documents
- `event` — things that happened on a specific date
- `person` — entity record for a human (see OB-022)

**Changes:**
- Expand `ThoughtType` union in `src/types/index.ts`
- Add `extractionToThoughtType()` mapping in `src/routes/documents.ts` — replaces hardcoded `"reference"` with type inferred from `extraction.document_type`
- Update classifier prompt (`src/prompts/thought-classification.yaml`) with new types and examples for text capture (e.g. "paid $45 electric bill" → `expense`)
- No DB migration needed — `thought_type` is an unconstrained text column
- Update UI type filters and color mapping in browse/explore

**Note on household data:** No separate household table exists. The `maintenance` type covers property/household records — paint colors, appliance repairs, renovation notes all capture as `maintenance` thoughts.

---

### OB-021: Conversational Query + Telegram Sessions

| Field | Value |
|-------|-------|
| **ID** | OB-021 |
| **Status** | done |
| **Priority** | high |
| **Added** | Apr 8, 2026 |
| **Completed** | Apr 8, 2026 |
| **Note** | Backend + Telegram done. PWA chat history wiring is a small follow-on (not a separate item). |

Add conversation history to the query endpoint and a session mode to the Telegram bot so follow-up questions work naturally.

**Part A — Stateful query endpoint:**
- `POST /thoughts/query` gains optional `history: Array<{ role: "user" | "assistant", content: string }>` param
- `queryBrain()` accepts and passes history as prior turns in the LLM call
- Search still runs against the current question only (keeps retrieval focused)

**Part B — Telegram session mode:**
- New `telegram/src/session.ts` — in-memory session store keyed by `chat_id`
- TTL: 5 minutes from last activity. Max: 10 turns per session
- `/ask <question>` starts or continues a session
- Plain text while session is active → treated as follow-up, not captured as thought
- `/done` or timeout → exit session, return to capture mode
- Each bot reply while in session shows: _↩ Reply to follow up · /done to exit_

**Part C — PWA:**
- Chat interface already exists. Wire up client-side history: each Q&A exchange appended to a local array, passed with subsequent queries. No backend session needed.

---

### OB-022: People & Relationship Model

| Field | Value |
|-------|-------|
| **ID** | OB-022 |
| **Status** | proposed |
| **Priority** | medium |
| **Added** | Apr 8, 2026 |
| **Depends on** | OB-020 |

Make the brain the home for relationship knowledge — replacing scattered Google Contacts data with something that can be queried intelligently.

**Model:** A person is a `thought` with `thought_type: "person"` and structured `metadata.person` fields (full_name, aliases, relationship, relationship_path, birthday, contact info). No new tables — person records live alongside all other thoughts.

**Observations** are regular thoughts linked to a person via `metadata.subject_person_id`. Example: "Emma's partner is now Jake (April 2026)" captured as a `note` thought with `subject_person_id` pointing to Emma's person record.

**Supersession** (update pattern for changing facts):
- New observation added with updated info
- Old observation marked `superseded_by: <new-thought-id>`
- Add `superseded_by` column to `thoughts` table (nullable)
- Queries exclude superseded thoughts by default; retrievable with `?include_superseded=true`
- API: `POST /thoughts/:id/supersede`, `GET /thoughts/:id/history`

**Capture UX:** Plain text "Emma's partner is Jake" → captured normally. Classifier detects it relates to a known person via `auto_people`. No friction. PWA chat: `/person Emma Chen` starts or retrieves her record; follow-ups add observations.

---

### OB-023: Type-Aware Aging

| Field | Value |
|-------|-------|
| **ID** | OB-023 |
| **Status** | proposed |
| **Priority** | low |
| **Added** | Apr 8, 2026 |
| **Depends on** | OB-017, OB-020 |

Extend the OB-017 gardener with type-specific aging rules to reduce query noise from stale data without deleting anything.

**Rules:**

| Type | Rule | Action |
|------|------|--------|
| `task` | > 90 days, never referenced | Auto-archive |
| `expense` | > 7 years | Auto-archive |
| `reference` (reading queue) | > 30 days, never accessed | Surface in weekly digest: summarize or dismiss |
| `maintenance` | Evergreen | Never auto-archive |
| `person` | Evergreen | Never auto-archive |
| `contract` | Evergreen until expiry | Flag 30 days before `details.expiry_date` |
| `insurance` | Expiry-aware | Surface 60 days before expiry |
| `note`, `idea`, `reflection` | > 2 years, no topics, zero access | Tag `needs_review`, add to digest |

**Implementation:** New `AgingGardener` class extending the existing gardener scheduler. Actions: `archive` (status → archived, excluded from default search), `surface` (add to weekly digest), `flag` (tag `needs_review`). No deletions — archived thoughts always retrievable with `?include_archived=true`.

---

### OB-024: Audio Capture & Transcription

| Field | Value |
|-------|-------|
| **ID** | OB-024 |
| **Status** | done |
| **Priority** | medium |
| **Added** | Apr 8, 2026 |
| **Completed** | Apr 8, 2026 |

Transcribe audio sent via Telegram (voice messages, forwarded voicemails, audio files) and capture the transcript as a thought. Zero-decision — send audio, brain captures it.

**Pipeline:**
1. Detect audio in Telegram handler: `audio/ogg` (voice messages), `audio/mpeg`, `audio/m4a`, `audio/wav`
2. Download from Telegram (same pattern as photos/documents)
3. Transcribe via Whisper API (OpenAI) — ~$0.006/min, no infrastructure needed
4. Optional LLM cleanup pass: remove filler words, fix proper nouns, preserve meaning
5. Capture as `note` thought with transcript as `text`, audio file archived to Wasabi
6. Bot reply confirms: transcript preview + "Saved and indexed"

**Metadata stored:**
```json
{
  "transcribed_from": "audio",
  "audio_duration_seconds": 45,
  "audio_mime_type": "audio/ogg",
  "wasabi_key": "...",
  "whisper_model": "whisper-1"
}
```

**Thought type:** `note` — no new type needed. `source_channel: telegram`, metadata indicates audio origin.

**Telegram message types handled:**
- Voice message (microphone button) → `message:voice`
- Audio file sent as attachment → `message:audio`
- Both route to the same transcription handler

**Config:** Add `OPENAI_API_KEY` env var (Whisper only — no other OpenAI dependency). If not configured, bot replies: "Audio received but transcription is not configured. Add a caption to save as a note."

**Future:** Local Whisper via a sidecar container is a viable alternative if OpenAI dependency is undesirable, but adds ops complexity. Start with the API.
