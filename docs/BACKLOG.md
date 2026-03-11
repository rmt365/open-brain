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

_(none)_

---

## Planned

### OB-009: Independent Multi-Instance Production Deployment

| Field | Value |
|-------|-------|
| **ID** | OB-009 |
| **Status** | planned |
| **Priority** | high |
| **Plan file** | `.claude/plans/melodic-swimming-mochi.md` |

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
