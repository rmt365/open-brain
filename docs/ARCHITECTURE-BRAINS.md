# Brain Architecture: OB, BoB, BoW

## Three brains, three purposes

### Open Brain (OB) — Personal knowledge vault
- **Owner:** An individual person
- **Contains:** What *I* know, think, want, remember
- **Follows:** The person, survives any business relationship
- **Access:** Private by default, grants extend read access to other systems
- **Philosophy:** Opinionated defaults, minimal friction, system organizes itself
- **Users:** Anyone who wants a personal knowledge capture system

### Body of Business (BoB) — Institutional knowledge vault
- **Owner:** A business entity (focused on small/medium businesses, not corporate)
- **Contains:** What *the business* knows — decisions, processes, rules, exceptions, precedents
- **Survives:** Any person leaving — institutional memory independent of individuals
- **Access:** Multi-user with attribution, auditable (append-only, latest applies)
- **Philosophy:** Structured, auditable, authoritative. Owner reviews, staff contributes.
- **Users:** Business owners, staff, authorized agents acting on behalf of the business

### Body of Work (BoW) — Professional knowledge corpus
- **Owner:** An individual (typically a thought leader, coach, consultant, specialist)
- **Contains:** Published and unpublished professional/domain expertise — podcasts, articles, manuscripts, musings
- **Purpose:** Feeds products and services (e.g., TFS book production service)
- **Separate because:** Most people won't have one; may have domain-specific functionality; intended to be plugged into other services
- **Future:** May merge into OB if the separation proves unnecessary

## The ownership test

**If you got hit by a bus, who needs this knowledge?**

| Answer | Brain |
|--------|-------|
| Just me | OB |
| The business, regardless of who works there | BoB |
| My audience / readers / clients | BoW |
| Me AND a business | OB (personal copy) + BoB (institutional copy) |

When knowledge spans personal and business domains, it gets captured in both — with different framing, different ownership, and different access rules. **Don't share a single record across brains.** Duplication isn't the enemy; ambiguous ownership is.

## How they connect: grants, not sharing

The brains connect through **read access grants** (OB-013), not shared records.

- Robin's OB grants read access to Cerulean's BoB for specific domains
- BoB agents can *consult* Robin's expertise when making decisions
- The institutional decision gets captured in BoB with attribution ("based on Robin's input, 2026-03-22")
- If Robin leaves, the business still has its decisions with context
- Robin still has all their knowledge in OB

## Multi-business ownership

A person like Robin who owns Cerulean Core and is vital to TFS:
- Has **one OB** — personal knowledge, follows Robin everywhere
- Cerulean Core has **its own BoB** — institutional knowledge for that business
- TFS has **its own BoB** — institutional knowledge for that business
- Robin may have **a BoW** — professional corpus for thought leadership

Robin's personal Docker knowledge lives in OB. "This is how we deploy at Cerulean Core" lives in Cerulean's BoB. Robin's article about deployment best practices lives in BoW.

Robin's OB can grant read access to both BoB instances. Each BoB captures its own institutional decisions.

## Staff and "bring your own brain"

- **Every person gets their own OB if they want one.** It's theirs. The business never sees inside it.
- **BoB captures institutional knowledge from staff interactions.** When a staff member says "Client X always pays net-60 even though the agreement says net-30," that goes in BoB.
- **If someone brings their own OB:** Their OB stays theirs. They contribute to BoB through normal work interactions. The BoB captures the business-relevant output, not their personal thought process.

### BoB user hierarchy

Two levels (minimum):
- **Owner/admin** — can review, course-correct, approve gardener proposals, manage grants, define areas
- **Contributor** — can capture knowledge, attributed and auditable, can't change business rules or areas

## Life areas and topics

### OB: Opinionated defaults + onboarding interview

Suggested universal defaults (replacing Robin's personal set):

| Area | Covers |
|------|--------|
| work | Professional skills, craft, career development |
| business | Business activities, ventures, income |
| technology | Systems, tools, infrastructure, automation |
| health | Physical and mental wellness, fitness, energy |
| family | Partnership, marriage, kids, household |
| people | Friendships, networking, community, relationships |
| creative | Side projects, writing, art, hobbies |
| aspirations | Big goals, moonshots, dreams, wild ideas |
| growth | Self-improvement, habits, productivity, learning |

**Onboarding interview:** Ask 5-6 questions ("What do you do for work? What matters to you outside work? What are you trying to get better at?") — map answers to areas, let user rename/add/remove. System picks intelligent defaults, user tweaks.

**Life areas are user-configurable,** not a hardcoded enum.

### BoB: Business areas (more standardized)

| Area | Covers |
|------|--------|
| operations | Processes, workflows, how things get done |
| sales | Revenue, deals, pipeline, marketing |
| customers | Client relationships, exceptions, preferences |
| team | Staff, contractors, roles, responsibilities |
| finance | Accounting, invoicing, billing, budgets |
| legal | Agreements, contracts, compliance, regulatory |
| products | Products, services, offerings |
| vendors | Partners, suppliers, service providers |

**Onboarding interview:** "What kind of business? How many people? Do you have vendors? Do you have formal agreements?" — refine area list.

### Topics: grow organically, garden automatically

Topics should **emerge from the data**, not be predefined. The system auto-classifies topics from captured content. A gardening agent maintains them:

1. **Auto-approve** topics appearing 3+ times with consistent naming
2. **Auto-merge** obvious duplicates (cosine similarity on topic name embeddings)
3. **Auto-assign** life/business areas to topics based on the thoughts they contain
4. **Weekly digest** to the user: "Added 5 new topics, merged 2 duplicates" — review only if you want to

The user never *has* to manage topics. They just appear, get organized, and the visualization fills in naturally.

## Gardening agents

Different rules per brain type:

### OB gardening (relaxed)
- Auto-approve topics freely
- Merge duplicates aggressively
- Auto-assign life areas
- Surface a summary, don't ask permission
- User course-corrects after the fact

### BoB gardening (cautious, auditable)
- Propose topic merges, don't auto-execute
- Surface decisions that need owner review
- Never delete — propose superseding entries
- All gardener actions attributed and logged
- Owner approves structural changes (new areas, topic merges)

### BoW gardening (domain-specific)
- TBD — depends on how BoW evolves
- Likely similar to OB but with publication-awareness (public vs. draft vs. private)

## Access tiers and inheritance

OB contains deeply personal knowledge alongside practical information others may need. The grants model needs **time-conditional access** to handle this:

### Three access tiers

| Tier | When accessible | Example content |
|------|----------------|-----------------|
| **Shared now** | Always, via active grant | Bank accounts, insurance docs, household info, passwords |
| **Released on event** | Dormant until triggered (death, incapacity) | Full financial picture, legal docs, "where things are" |
| **Never** | No grant can reach this, ever | Personal reflections, private journals, things that die with you |

### Grant trigger conditions

- `active` — accessible immediately and ongoing
- `on_event: incapacity` or `on_event: death` — dormant until triggered, not revocable after trigger
- Partitions marked `excluded` — no grant of any type can reach them

### Trigger mechanism (TBD)

How "the event" gets triggered is an implementation question:
- Dead man's switch (periodic check-in, auto-triggers after N days of silence)?
- Trusted third party with a trigger token?
- Legal executor with credentials?
- Multiple trigger options for redundancy?

The data model needs to support the concept regardless of which trigger mechanism is chosen.

### Spouse/family grant example

Robin grants Tina:
- **Active grant** scoped to: family, finance, household partitions → she sees bank info, insurance, household items now
- **On-death grant** scoped to: all partitions EXCEPT excluded → she gets the full picture minus private journals
- **Excluded partitions:** personal reflections, private journals → no grant of any type, ever

## Memory consolidation (thought decay)

Human memory consolidates over time — details fade, lessons persist. A knowledge system should do the same. The benefit isn't primarily disk space; it's **search quality, context window efficiency, and cognitive clarity**.

### Consolidation tiers by age and access

| Pattern | Action | Keeps | Compresses |
|---------|--------|-------|------------|
| Fresh (< 30 days) | None | Everything | — |
| Active (any age, recently accessed) | None | Everything | — |
| Aging (30-180 days, untouched) | Flag as candidate | Full text | Nothing yet |
| Old (180+ days, never revisited) | Summarize + archive full text | Summary, lessons, key entities, source URL, metadata | Full text → cold storage (S3) |
| Ancient (1+ year, never accessed) | Deep consolidation | One-paragraph essence | Full text archived, original embedding replaced with summary embedding |

### Summary-first ingestion

When content is ingested (URLs, documents), the system should store an **AI-generated summary as the primary text**, not the raw content. Most users don't go back and read the full article — they want the takeaways.

**Ingestion flow (proposed):**
1. Fetch full page content (same as now)
2. Generate AI summary: 3-5 key takeaways, why it matters, lessons/implications
3. Store **summary as the thought's `text`** — this is what appears in search, browse, treemap
4. Archive **full text in metadata** (`metadata.full_text`) or cold storage — retrievable if needed
5. Chunk and embed the **summary** (not the raw article) — produces better search relevance
6. Keep `source_url` — the original is always one click away

**Why this is better:**
- Search results return concise, meaningful summaries instead of walls of scraped text with nav elements
- Embeddings represent the *meaning* of the article, not boilerplate
- The treemap and browse views show useful previews
- Context window usage is dramatically better when an LLM agent pulls thoughts
- Matches how human memory actually works: you read, extract takeaways, remember those

**The summary IS the thought. The article is the source.**

For documents (receipts, PDFs), the OCR extraction + summary approach already works similarly. This extends the same principle to URL ingestion.

### Original thoughts vs. ingested content

- **Original thoughts** (user's own words, reasoning, reflections) — never auto-compressed. A user's voice and reasoning are precious at any age. Gardening agent may *synthesize* related thoughts, but keeps originals as versions.
- **Ingested content** (URLs, documents, articles) — strong candidates for consolidation. The full text is often retrievable from the source URL. What the brain needs is: key takeaway, lessons, entities, and a pointer to the original.

### Consolidation agent (gardener role)

1. **Identify candidates** — old, unaccessed, large text, especially ingested content
2. **Generate summary** — LLM distills to: key takeaway, lessons learned, entities, action items
3. **Archive original** — full text to cold storage (S3/Wasabi), keep a pointer (`archived_text_key`)
4. **Update in-place** — condensed `text`, new embedding for the summary, `consolidated_at` timestamp
5. **Reversible** — user can "expand" a consolidated thought to retrieve the original from cold storage
6. **Never consolidate** recently accessed, starred/pinned, or user-marked-important thoughts

### What consolidation improves

- **Search quality** — fewer, more focused embeddings = less noise in semantic results
- **Context window efficiency** — LLM agents get concise summaries instead of walls of article text
- **Cognitive clarity** — treemap and browse views show meaningful signal, not accumulated noise
- **Cold storage cost** — minimal (Wasabi is ~$6/TB/month), and full text is still retrievable

## Backup health and restore verification

Every brain instance replicates its SQLite database to S3 via Litestream. Users and operators need confidence that backups are working and recoverable.

### Backup health indicator (all pages)

A stoplight indicator visible in the header of every page:
- **Green:** last replication < 5 minutes ago
- **Yellow:** last replication 5-30 minutes ago (lagging)
- **Red:** no replication in 30+ minutes, or Litestream not running
- **Hover/tap tooltip:** "Last backup: 2 min ago | Size: 2.4MB"

Powered by `GET /health/backup` endpoint that checks Litestream status and/or S3 object last-modified timestamp.

### Restore testing

Periodic verification that the backup is actually recoverable:
1. Pull backup from S3 to a temp location
2. Open as a separate SQLite connection (never touch live DB)
3. Run validation: row counts, latest thought exists, schema version matches, `PRAGMA integrity_check`
4. Report pass/fail with details
5. Clean up temp file

Available as:
- **On-demand:** button in UI or MCP tool — "test my backup now"
- **Scheduled:** gardening agent runs weekly, logs results, alerts on failure

### Multi-instance ops (Cerulean)

For the operator managing multiple brains/BoB/BoW instances:
- Dashboard showing all instances at a glance
- Backup status, last restore test result, storage usage per instance
- Alerting on failures (email, Slack, Telegram)
- This is a separate ops UI from the personal brain pages

## Design principles (all brains)

1. **Minimal cognitive load** — the system is opinionated with rational defaults. Users can adjust but shouldn't have to.
2. **Capture first, organize later** — never block capture for classification or organization
3. **Graceful degradation** — always accept input even if AI services are down
4. **System maintains itself** — gardening agents keep data clean; humans course-correct
5. **Auditable where required** — BoB is append-only with attribution; OB is personal and mutable
6. **Grants, not sharing** — brains connect through access grants, not shared records
