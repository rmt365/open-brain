# Auto URL Detection & Ingestion

## Problem

When users send a URL through the chat UI or Telegram, it's stored as a plain text note. The URL content is never fetched, parsed, or embedded for semantic search. The existing `ingestUrl()` pipeline only runs when explicitly called via `POST /thoughts/ingest` or the MCP `ingest_url` tool.

## Solution

Detect URLs in incoming thoughts during `capture()` and automatically trigger URL ingestion. The behavior adapts based on whether the message is essentially just a URL or a longer thought that mentions one.

## Detection Logic

### URL Extraction

Extract URLs from thought text using a regex that matches `http://` and `https://` URLs. The regex should handle common edge cases: URLs with parentheses (e.g., Wikipedia links), trailing punctuation (periods, commas) not included, and query strings/fragments.

### Message Classification: URL-Only vs URL-Mentioned

**URL-only:** The message is a bare URL, or a short wrapper like "Log this URL: https://...", "save https://...", "bookmark https://...". Heuristic: strip the URL(s) from the text — if the remaining text is under ~30 characters (after trimming whitespace and common prefixes like "log", "save", "bookmark", "check out"), treat it as URL-only.

Examples:
- `"https://example.com"` — URL-only (empty remainder)
- `"save https://example.com"` — URL-only ("save" = 4 chars)
- `"Log this URL: https://example.com"` — URL-only ("Log this URL:" = 13 chars)
- `"this is interesting https://example.com"` — URL-only ("this is interesting" = 19 chars)
- `"I found this article about machine learning https://example.com"` — URL-mentioned (43 chars remaining)

**URL-mentioned:** A longer thought that happens to contain a URL. Example: "I was reading https://example.com/article and it made me think about our pricing strategy."

### Multiple URLs

**URL-only with multiple URLs:** Use the first URL for the smart replace. Remaining URLs are ingested as separate reference thoughts (same as URL-mentioned behavior).

**URL-mentioned with multiple URLs:** Each URL spawns its own background ingestion. `source_url` on the original thought is set to the first URL.

## Behavior

### URL-Only Messages (Smart Replace)

1. Thought is stored immediately as usual (existing behavior)
2. In the async post-capture block, fetch the URL content using `extractUrlContent()`
3. On success, update the original thought in-place using a direct DB update:
   - Set `thought_type` to `"reference"`
   - Replace `text` with `"{title}\n\n{preview}"` (title + first 500 chars)
   - Set `source_url` to the URL
   - Store fetch metadata (`title`, `url`, `fetchedAt`) in `metadata`
4. Re-embed the thought with the new text (the initial embedding was for the bare URL, which is not useful)
5. Chunk and embed the full fetched content against this thought (reuse chunking logic from `ingestUrl()`)
6. For URL-only messages, skip classification in the initial `Promise.allSettled()`. After the smart replace updates the thought text, re-classify using the fetched content (title + preview) so that `auto_topics`, `auto_life_area`, etc. are meaningful. Classifying a bare URL string produces garbage.

**Required schema change:** Add a `updateThoughtForUrlIngest()` method to `OpenBrainDatabaseManager` that updates `text`, `thought_type`, `source_url`, and `metadata` on an existing thought. This is a targeted update method, not a change to the general `updateThought()` interface.

### URL-Mentioned Messages (Keep + Link)

1. Thought is stored as-is (existing behavior)
2. Update `source_url` on the original thought to the first URL found (via `updateThoughtForUrlIngest()`)
3. For each URL detected, spawn background ingestion using `ingestUrlContent()` (see below — NOT calling `ingestUrl()` directly)
4. The original thought and the ingested reference(s) are independent rows — no foreign key link, but the URL appears in both

### Recursion Guard

`ingestUrl()` internally calls `capture()`. With URL detection now in `capture()`, this creates a recursion risk: `capture()` → detects URL → `ingestUrl()` → `capture()` → detects URL → ...

**Solution:** `capture()` skips URL detection when `thoughtType === "reference"`. The `ingestUrl()` method already passes `"reference"` as the thought type, so this guard works without any parameter changes. This also makes semantic sense — reference thoughts created from ingested URLs don't need their content re-scanned for URLs.

### Shared Ingestion Logic

Extract the URL fetching + chunking + embedding logic from `ingestUrl()` into a helper method:

```typescript
async ingestUrlContent(thoughtId: string, url: string): Promise<ExtractedContent | null>
```

This method:
1. Fetches content with `extractUrlContent()`
2. If fetch fails, returns `null`
3. Chunks the content if needed (`needsChunking()`)
4. Creates chunk rows and embeddings against the given thought ID
5. Returns the `ExtractedContent` (title, text, url, fetchedAt) so callers can use it for thought updates

**Callers:**
- `ingestUrl()` calls it after creating the reference thought, uses the returned content for logging only (it already has the content from its own fetch — refactor to let `ingestUrlContent` own the fetch)
- URL-only smart replace uses the returned content to update the thought's text, metadata, and to trigger re-embedding + re-classification
- URL-mentioned path calls it for each URL to create separate reference thoughts (still calls `ingestUrl()` which internally uses this helper)

Both `ingestUrl()` and the new auto-detection code call this shared helper. This avoids duplicating the chunking/embedding logic.

### Failure Handling

Silent fail. If URL fetch fails (network error, paywall, timeout), log a warning. The original thought is already saved with the URL in the text body. No retry mechanism in this iteration — the URL is preserved for future manual reprocessing.

## Integration Point

All changes are in `ThoughtManager` in `src/logic/thoughts.ts`. The URL detection runs in the existing `Promise.allSettled()` block that already handles embedding and classification. Note: this block is currently awaited (not fire-and-forget) — `capture()` waits for all async work to complete before returning the thought. URL processing joins this same awaited block, which means capture will be slightly slower for URL-containing thoughts but the caller gets back a fully-processed thought.

- No client changes (web UI, Telegram bot, MCP, raw API all go through `capture()`)
- Graceful degradation — if URL fetch fails, the thought is still captured

## New Files

### `src/logic/url-detection.ts`

Contains:
- `extractUrls(text: string): string[]` — URL regex extraction
- `isUrlOnlyMessage(text: string, urls: string[]): boolean` — classification heuristic

## Changes to Existing Files

### `src/logic/thoughts.ts`

- `capture()`: add URL detection after thought is stored, within the `Promise.allSettled()` block
- Extract shared ingestion logic from `ingestUrl()` into `ingestUrlContent()`
- `ingestUrl()`: refactor to use `ingestUrlContent()`

### `src/db/openBrainDatabaseManager.ts`

- Add `updateThoughtForUrlIngest()` method for updating text, thought_type, source_url, and metadata

## Scope

### In scope

- URL detection in `capture()`
- Smart replace for URL-only messages (with re-embedding)
- Background ingestion for URL-mentioned messages
- Setting `source_url` on thoughts with detected URLs
- Recursion guard for `capture()` ↔ `ingestUrl()` cycle
- Refactoring `ingestUrl()` to share chunking logic

### Out of scope

- Retry mechanism for failed URL fetches
- UI changes to show URL ingestion status
- Changing the classification prompt to detect URLs
- Link/relationship between original thought and ingested reference thoughts

## Testing

- Unit tests for `extractUrls()` and `isUrlOnlyMessage()` with various message formats
- Unit test: verify URL-only classification boundary (edge cases around 30-char threshold)
- Integration test: capture a bare URL, verify it becomes a reference thought with fetched content and re-embedded
- Integration test: capture a thought mentioning a URL, verify original is preserved and separate reference is created
- Integration test: capture a message with no URL, verify no change in behavior
- Integration test: capture with `thoughtType: "reference"` to verify recursion guard skips URL detection
- Test with unreachable URL to verify silent failure
