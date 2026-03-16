# UI: Browse View & Capture Feedback

## Problem

The PWA chat UI is capture-only. After submitting a thought (especially a URL), the user gets a generic "Got it — tagged as X" with no indication of whether URL content was fetched, what was extracted, or where it landed. There's no way to browse, search, or review collected thoughts without using the API or MCP tools directly.

## Solution

Two independent improvements to the PWA:

1. **Better capture feedback** — Richer acknowledgment messages in the chat UI that distinguish URL-only, URL-mentioned, and normal thoughts
2. **Browse view** — A new `/ui/browse` route with a compact feed layout for reviewing, searching, and correcting thoughts

## Feature 1: Capture Feedback

### Current Behavior

The `_buildAck()` method in `open-brain-chat.js` produces a generic message like "Got it — tagged as reflection about writing" for all thoughts, regardless of whether URL ingestion happened.

### New Behavior

`_buildAck()` checks the response data for URL ingestion signals and produces context-appropriate feedback:

**URL-only (smart replace):** Response has `source_url` AND `thought_type === "reference"` AND `metadata.title` exists.

> "Fetched: *{metadata.title}* from {domain} — saved as reference, indexed for search"
> `[topic1] [topic2]`

Extract the domain from `source_url` for display (e.g., `twinflamesstudios.com`).

**URL-mentioned (keep + link):** Response has `source_url` AND `thought_type !== "reference"`.

> "Got it — tagged as {auto_type} about {topics}. Also fetching {source_url} in the background."
> `[topic1] [topic2]`

**URL-only with failed fetch:** Response has `source_url` but `thought_type !== "reference"` and no `metadata.title`. This looks like URL-mentioned but was actually a failed smart replace. Fall back to the URL-mentioned message (mentioning the URL is still useful feedback).

**Normal thought (no URL):** Response has no `source_url`. Behavior unchanged.

> "Got it — tagged as {auto_type} about {topics}"
> `[topic1] [topic2]`

### Changes

**File:** `src/ui/static/js/components/open-brain-chat.js`

Modify the `_buildAck(data)` method only. The response from `POST /thoughts` already contains `source_url`, `thought_type`, `metadata`, and `auto_topics` — no API changes needed.

## Feature 2: Browse View

### Route

`GET /ui/browse` — a new HTML page served by the UI router, loading a new `<open-brain-browse>` Lit web component.

### Layout: Compact Feed

- **Search bar** at top — calls `POST /thoughts/search` for semantic search, or `GET /thoughts` with query params for filtered listing
- **Filter chips** below search — toggle by thought type (`All`, `reference`, `idea`, `task`, `note`, `observation`, `question`, `decision`, `reflection`). Active chip is highlighted. Only one active at a time (or All).
- **Compact rows** — each row shows:
  - Type badge (abbreviated, color-coded: reference=indigo, idea=blue, task=amber, note=gray, observation=green, question=cyan, decision=purple, reflection=pink)
  - Primary text (thought text, truncated to ~80 chars, or title for references)
  - Secondary line: topics + domain (for references)
  - Relative timestamp (right-aligned)

### Expanded Row

Tapping a row expands it inline (accordion-style, one open at a time):

- **Source URL** (clickable, shown for reference thoughts only)
- **Full text preview** — the complete thought text or fetched content preview
- **Topic pills** — shown as removable badges
- **Metadata grid** (2-column): life area, sentiment, confidence, embedding status
- **Inline edit** — light-touch corrections:
  - Tap type badge → dropdown picker with 8 thought types (calls `PUT /thoughts/:id`)
  - Tap life area value → dropdown picker with 9 life areas (calls `PUT /thoughts/:id`)
  - Changes apply immediately (optimistic update + API call, no save button)

### Navigation

A small nav link between chat and browse:
- Chat view (`/ui/brain`): link/icon to browse in the header
- Browse view (`/ui/browse`): link/icon back to chat in the header

### API Usage

The browse view uses existing API endpoints — no backend changes needed:

- `GET /thoughts?type=X&limit=50&offset=0` — list with filters, paginated (note: query param is `type`, not `thought_type`). Response shape: `{ success: true, data: { items: Thought[], total: number, limit: number, offset: number } }`
- `POST /thoughts/search` — semantic search
- `PUT /thoughts/:id` — update type, life area
- `GET /thoughts/:id` — get single thought (for detail, if needed)

### Pagination

Initial load fetches 50 thoughts. Scroll-to-bottom triggers loading the next page (`offset += 50`). Simple infinite scroll.

### New Files

- `src/ui/static/js/components/open-brain-browse.js` — new Lit web component (~400-600 lines estimated)
- Modify `src/ui/routes.ts` — add `/browse` route that serves the new component

### Styling

Match the existing chat component's design language:
- Same color scheme (deep indigo header, dark backgrounds, indigo accents)
- Same font stack, spacing conventions
- Same header layout with brain icon + title

## Scope

### In scope

- `_buildAck()` improvements for URL feedback in chat
- New `/ui/browse` route and `<open-brain-browse>` component
- Compact feed with search, type filters, expandable rows
- Inline type/life-area editing
- Nav links between chat and browse

### Out of scope

- Topic add/remove UI (future — needs API support for manual topic assignment)
- Thought deletion from the UI
- Full-text editing of thought content
- Real-time updates / WebSocket push
- Mobile-specific layout adaptations (the compact feed works on mobile as-is)

## Testing

- Manual: verify capture feedback messages for URL-only, URL-mentioned, and normal thoughts
- Manual: verify browse view loads, filters work, search works, expand/collapse works
- Manual: verify inline type/life-area editing persists via API
- Verify `deno task verify` still passes (no backend changes)
