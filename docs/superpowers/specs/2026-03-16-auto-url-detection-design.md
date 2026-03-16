# Auto URL Detection & Ingestion

## Problem

When users send a URL through the chat UI or Telegram, it's stored as a plain text note. The URL content is never fetched, parsed, or embedded for semantic search. The existing `ingestUrl()` pipeline only runs when explicitly called via `POST /thoughts/ingest` or the MCP `ingest_url` tool.

## Solution

Detect URLs in incoming thoughts during `capture()` and automatically trigger URL ingestion. The behavior adapts based on whether the message is essentially just a URL or a longer thought that mentions one.

## Detection Logic

### URL Extraction

Extract URLs from thought text using a standard URL regex pattern. Match `http://` and `https://` URLs.

### Message Classification: URL-Only vs URL-Mentioned

**URL-only:** The message is a bare URL, or a short wrapper like "Log this URL: https://...", "save https://...", "bookmark https://...". Heuristic: strip the URL(s) from the text — if the remaining text is under ~30 characters (after trimming whitespace and common prefixes like "log", "save", "bookmark", "check out"), treat it as URL-only.

**URL-mentioned:** A longer thought that happens to contain a URL. Example: "I was reading https://example.com/article and it made me think about our pricing strategy."

## Behavior

### URL-Only Messages (Smart Replace)

1. Thought is stored immediately as usual (existing behavior)
2. In the async post-capture block, fetch and ingest the URL
3. On success, update the original thought in-place:
   - Set `thought_type` to `"reference"`
   - Replace `text` with `"{title}\n\n{preview}"` (title + first 500 chars)
   - Set `source_url` to the URL
   - Store fetch metadata (`title`, `url`, `fetchedAt`) in `metadata`
4. Chunk and embed the full fetched content against this thought (same as existing `ingestUrl()` chunking logic)
5. Classification still runs on the original text (or updated text — either is fine since it's async and order isn't guaranteed)

### URL-Mentioned Messages (Keep + Link)

1. Thought is stored as-is (existing behavior)
2. Set `source_url` on the original thought to the first URL found
3. For each URL detected, spawn background ingestion:
   - Call the existing `ingestUrl()` method, which creates a separate `"reference"` thought with chunks
4. The original thought and the ingested reference(s) are independent rows — no foreign key link, but the URL appears in both

### Failure Handling

Silent fail. If URL fetch fails (network error, paywall, timeout), log a warning. The original thought is already saved with the URL in the text body. No retry mechanism in this iteration — the URL is preserved for future manual reprocessing.

## Integration Point

All changes are in `ThoughtManager.capture()` in `src/logic/thoughts.ts`. The URL detection and ingestion joins the existing `Promise.allSettled()` block that runs embedding and classification. This means:

- No client changes (web UI, Telegram bot, MCP, raw API all go through `capture()`)
- Non-blocking — capture returns the thought immediately, URL processing is fire-and-forget
- Graceful degradation — if URL fetch fails, the thought is still captured

## Helper Functions

### `extractUrls(text: string): string[]`

Returns all `http://` and `https://` URLs found in the text.

### `isUrlOnlyMessage(text: string, urls: string[]): boolean`

Returns `true` if the message is essentially just a URL. Strips URLs from text, checks if remaining content is under ~30 chars after removing common prefixes (log, save, bookmark, check, etc.).

These can live in a new `src/logic/url-detection.ts` file or inline in `thoughts.ts` — they're small.

## Scope

### In scope

- URL detection in `capture()`
- Smart replace for URL-only messages
- Background ingestion for URL-mentioned messages
- Setting `source_url` on thoughts with detected URLs

### Out of scope

- Retry mechanism for failed URL fetches
- UI changes to show URL ingestion status
- Changing the classification prompt to detect URLs
- Link/relationship between original thought and ingested reference thoughts

## Testing

- Unit tests for `extractUrls()` and `isUrlOnlyMessage()` with various message formats
- Integration test: capture a bare URL, verify it becomes a reference thought with content
- Integration test: capture a thought mentioning a URL, verify original is preserved and reference is created
- Integration test: capture a message with no URL, verify no change in behavior
- Test with unreachable URL to verify silent failure
