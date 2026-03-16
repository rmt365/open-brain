# Auto URL Detection & Ingestion — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically detect URLs in captured thoughts and ingest their content, adapting behavior based on whether the message is URL-only or URL-mentioned.

**Architecture:** URL detection happens in `ThoughtManager.capture()` after the thought is stored. A new `src/logic/url-detection.ts` provides `extractUrls()` and `isUrlOnlyMessage()`. The existing `ingestUrl()` chunking logic is extracted into a shared `ingestUrlContent()` helper. A new DB method `updateThoughtForUrlIngest()` handles in-place thought updates for URL-only messages.

**Tech Stack:** Deno, TypeScript, SQLite (via `@db/sqlite`), Deno standard test runner

**Spec:** `docs/superpowers/specs/2026-03-16-auto-url-detection-design.md`

---

## Chunk 1: URL Detection Module

### Task 1: `extractUrls()` — explicit URL extraction

**Files:**
- Create: `src/logic/url-detection.ts`
- Create: `src/tests/url-detection_test.ts`

- [ ] **Step 1: Write failing tests for explicit URL extraction**

```typescript
// src/tests/url-detection_test.ts
import { assertEquals } from "jsr:@std/assert";
import { extractUrls } from "../logic/url-detection.ts";

Deno.test("extractUrls: finds https URL", () => {
  assertEquals(extractUrls("check https://example.com out"), ["https://example.com"]);
});

Deno.test("extractUrls: finds http URL", () => {
  assertEquals(extractUrls("see http://example.com"), ["http://example.com"]);
});

Deno.test("extractUrls: finds URL with path and query", () => {
  assertEquals(
    extractUrls("go to https://example.com/path?q=1&r=2#frag"),
    ["https://example.com/path?q=1&r=2#frag"]
  );
});

Deno.test("extractUrls: finds multiple URLs", () => {
  assertEquals(
    extractUrls("https://a.com and https://b.com/page"),
    ["https://a.com", "https://b.com/page"]
  );
});

Deno.test("extractUrls: strips trailing punctuation", () => {
  assertEquals(extractUrls("visit https://example.com."), ["https://example.com"]);
  assertEquals(extractUrls("visit https://example.com,"), ["https://example.com"]);
  assertEquals(extractUrls("(https://example.com)"), ["https://example.com"]);
});

Deno.test("extractUrls: handles URL with parentheses in path", () => {
  assertEquals(
    extractUrls("https://en.wikipedia.org/wiki/Foo_(bar)"),
    ["https://en.wikipedia.org/wiki/Foo_(bar)"]
  );
});

Deno.test("extractUrls: returns empty for no URLs", () => {
  assertEquals(extractUrls("just a regular thought"), []);
});

Deno.test("extractUrls: returns empty for empty string", () => {
  assertEquals(extractUrls(""), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test --allow-all src/tests/url-detection_test.ts`
Expected: FAIL — module `../logic/url-detection.ts` not found

- [ ] **Step 3: Implement `extractUrls()`**

```typescript
// src/logic/url-detection.ts

/**
 * Extract URLs from text.
 * Pass 1: explicit http/https URLs.
 * Pass 2: bare domains (word.tld or word.tld/path).
 */

// Match http:// and https:// URLs. Handles parentheses in paths (Wikipedia-style).
// Stops before trailing punctuation that's not part of the URL.
const EXPLICIT_URL_RE = /https?:\/\/[^\s<>\"]+[^\s<>\".,;:!?)}\]]/g;

/**
 * Extract all URLs from text. Returns fully-qualified URLs (bare domains get https:// prepended).
 * Pass 1: explicit http/https URLs.
 * Pass 2: bare domains (added in Task 2).
 */
export function extractUrls(text: string): string[] {
  const urls: string[] = [];

  // Pass 1: explicit URLs
  const explicitMatches = text.match(EXPLICIT_URL_RE) || [];
  for (const match of explicitMatches) {
    // Balance parentheses: if URL has unmatched trailing ), strip it
    urls.push(balanceParens(match));
  }

  return urls;
}

/** Strip trailing closing parens that don't have a matching open paren in the URL path. */
function balanceParens(url: string): string {
  let result = url;
  while (result.endsWith(")")) {
    const opens = (result.match(/\(/g) || []).length;
    const closes = (result.match(/\)/g) || []).length;
    if (closes > opens) {
      result = result.slice(0, -1);
    } else {
      break;
    }
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test --allow-all src/tests/url-detection_test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/logic/url-detection.ts src/tests/url-detection_test.ts
git commit -m "feat: add extractUrls() for explicit URL detection"
```

---

### Task 2: `extractUrls()` — bare domain detection

**Files:**
- Modify: `src/logic/url-detection.ts`
- Modify: `src/tests/url-detection_test.ts`

- [ ] **Step 1: Write failing tests for bare domain detection**

Append to `src/tests/url-detection_test.ts`:

```typescript
Deno.test("extractUrls: finds bare domain with path", () => {
  assertEquals(
    extractUrls("check twinflamesstudios.com/trust-business-audiobooks"),
    ["https://twinflamesstudios.com/trust-business-audiobooks"]
  );
});

Deno.test("extractUrls: finds bare domain without path", () => {
  assertEquals(extractUrls("visit example.com"), ["https://example.com"]);
});

Deno.test("extractUrls: finds bare .io domain", () => {
  assertEquals(extractUrls("see deno.io/docs"), ["https://deno.io/docs"]);
});

Deno.test("extractUrls: finds bare .co.uk domain", () => {
  assertEquals(extractUrls("check bbc.co.uk/news"), ["https://bbc.co.uk/news"]);
});

Deno.test("extractUrls: does not double-match explicit URL as bare domain", () => {
  assertEquals(
    extractUrls("https://example.com/page"),
    ["https://example.com/page"]
  );
});

Deno.test("extractUrls: does not match common words as domains", () => {
  assertEquals(extractUrls("I like this.thing a lot"), []);
});

Deno.test("extractUrls: finds both explicit and bare URLs", () => {
  const result = extractUrls("see https://a.com and b.com/page");
  assertEquals(result, ["https://a.com", "https://b.com/page"]);
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `deno test --allow-all src/tests/url-detection_test.ts`
Expected: New bare-domain tests FAIL, existing tests still PASS

- [ ] **Step 3: Add bare domain detection to `extractUrls()`**

Add to `src/logic/url-detection.ts`:

```typescript
// Common TLDs for bare domain detection.
const COMMON_TLDS = new Set([
  "com", "org", "net", "io", "co", "dev", "app", "me", "info", "biz",
  "us", "uk", "ca", "au", "de", "fr", "nl", "se", "no", "fi",
  "tv", "cc", "xyz", "tech", "ai", "gg", "fm", "so", "to",
  "studio", "design", "blog", "site", "online", "store", "shop",
]);

// Two-part TLDs like co.uk, com.au
const TWO_PART_TLDS = new Set([
  "co.uk", "com.au", "co.nz", "co.za", "com.br", "co.jp", "co.kr",
]);

// Match word.tld or word.tld/path (but not things inside explicit URLs)
const BARE_DOMAIN_RE = /(?<![/:])(?<!\w)([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:[a-zA-Z]{2,}\.)?[a-zA-Z]{2,}(?:\/[^\s<>\"]*[^\s<>\".,;:!?)}\]])?)/g;
```

Update `extractUrls()` to add Pass 2:

```typescript
export function extractUrls(text: string): string[] {
  const urls: string[] = [];
  const matchedRanges: Array<[number, number]> = [];

  // Pass 1: explicit URLs
  for (const match of text.matchAll(EXPLICIT_URL_RE)) {
    const url = balanceParens(match[0]);
    urls.push(url);
    matchedRanges.push([match.index!, match.index! + match[0].length]);
  }

  // Pass 2: bare domains — skip ranges already matched by Pass 1
  for (const match of text.matchAll(BARE_DOMAIN_RE)) {
    const start = match.index!;
    const end = start + match[0].length;

    // Skip if this overlaps with an explicit URL match
    const overlaps = matchedRanges.some(
      ([rStart, rEnd]) => start >= rStart && start < rEnd
    );
    if (overlaps) continue;

    // Validate the TLD
    const domain = match[0].split("/")[0];
    const parts = domain.split(".");
    const twoPartTld = parts.length >= 3 ? `${parts[parts.length - 2]}.${parts[parts.length - 1]}` : "";
    const singleTld = parts[parts.length - 1];

    if (TWO_PART_TLDS.has(twoPartTld) || COMMON_TLDS.has(singleTld)) {
      urls.push(`https://${balanceParens(match[0])}`);
      matchedRanges.push([start, end]);
    }
  }

  return urls;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test --allow-all src/tests/url-detection_test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/logic/url-detection.ts src/tests/url-detection_test.ts
git commit -m "feat: add bare domain detection to extractUrls()"
```

---

### Task 3: `isUrlOnlyMessage()`

**Files:**
- Modify: `src/logic/url-detection.ts`
- Modify: `src/tests/url-detection_test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/tests/url-detection_test.ts`:

```typescript
import { isUrlOnlyMessage } from "../logic/url-detection.ts";

Deno.test("isUrlOnlyMessage: bare URL is URL-only", () => {
  assertEquals(isUrlOnlyMessage("https://example.com", ["https://example.com"]), true);
});

Deno.test("isUrlOnlyMessage: bare domain is URL-only", () => {
  assertEquals(
    isUrlOnlyMessage("twinflamesstudios.com/path", ["https://twinflamesstudios.com/path"]),
    true
  );
});

Deno.test("isUrlOnlyMessage: 'save URL' is URL-only", () => {
  assertEquals(isUrlOnlyMessage("save https://example.com", ["https://example.com"]), true);
});

Deno.test("isUrlOnlyMessage: 'Log this URL:' is URL-only", () => {
  assertEquals(
    isUrlOnlyMessage("Log this URL: https://example.com", ["https://example.com"]),
    true
  );
});

Deno.test("isUrlOnlyMessage: 'bookmark this' is URL-only", () => {
  assertEquals(
    isUrlOnlyMessage("bookmark this https://example.com", ["https://example.com"]),
    true
  );
});

Deno.test("isUrlOnlyMessage: short context is URL-only", () => {
  assertEquals(
    isUrlOnlyMessage("this is interesting https://example.com", ["https://example.com"]),
    true
  );
});

Deno.test("isUrlOnlyMessage: long context is URL-mentioned", () => {
  assertEquals(
    isUrlOnlyMessage(
      "I found this article about machine learning https://example.com",
      ["https://example.com"]
    ),
    false
  );
});

Deno.test("isUrlOnlyMessage: thought with URL in the middle is URL-mentioned", () => {
  assertEquals(
    isUrlOnlyMessage(
      "I was reading https://example.com/article and it made me think about pricing",
      ["https://example.com/article"]
    ),
    false
  );
});

Deno.test("isUrlOnlyMessage: empty text with URL is URL-only", () => {
  assertEquals(isUrlOnlyMessage("", []), false);
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `deno test --allow-all src/tests/url-detection_test.ts`
Expected: FAIL — `isUrlOnlyMessage` not exported

- [ ] **Step 3: Implement `isUrlOnlyMessage()`**

Add to `src/logic/url-detection.ts`:

```typescript
const URL_ONLY_MAX_REMAINDER = 30;

/**
 * Determine if a message is essentially just a URL (or URLs) with minimal wrapper text.
 * Strips URLs and common prefixes from the text, then checks if the remainder is short.
 */
export function isUrlOnlyMessage(text: string, urls: string[]): boolean {
  if (urls.length === 0) return false;

  let remainder = text;

  // Strip explicit URLs from text
  for (const url of urls) {
    remainder = remainder.replace(url, "");
  }

  // Also strip bare domain versions (without https://) in case the original text had bare domains
  for (const url of urls) {
    const bareDomain = url.replace(/^https?:\/\//, "");
    remainder = remainder.replace(bareDomain, "");
  }

  // Strip common prefixes people use when bookmarking
  remainder = remainder
    .replace(/^(log|save|bookmark|check out|check|look at|read|watch|see|grab|capture)\b/i, "")
    .replace(/\bthis\s+url\b/i, "")
    .replace(/\bthis\s+link\b/i, "")
    .replace(/\bthis\b/i, "")
    .replace(/[:;,\-—–]/g, "")
    .trim();

  return remainder.length <= URL_ONLY_MAX_REMAINDER;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test --allow-all src/tests/url-detection_test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/logic/url-detection.ts src/tests/url-detection_test.ts
git commit -m "feat: add isUrlOnlyMessage() heuristic"
```

---

## Chunk 2: Database & Shared Helper

### Task 4: `updateThoughtForUrlIngest()` DB method

**Files:**
- Modify: `src/db/openBrainDatabaseManager.ts`

- [ ] **Step 1: Add the method**

Add after `updateThought()` method (around line 382) in `src/db/openBrainDatabaseManager.ts`:

```typescript
  /**
   * Update a thought after URL ingestion.
   * Sets text, thought_type, source_url, and metadata in a single update.
   * Used by auto URL detection — not part of the general update API.
   */
  updateThoughtForUrlIngest(
    id: string,
    data: {
      text: string;
      thought_type: string;
      source_url: string;
      metadata: Record<string, unknown>;
    }
  ): void {
    this.db.prepare(
      `UPDATE thoughts
       SET text = ?, thought_type = ?, source_url = ?, metadata = ?
       WHERE id = ?`
    ).run(data.text, data.thought_type, data.source_url, JSON.stringify(data.metadata), id);
  }
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `deno test --allow-all src/tests/standalone_test.ts`
Expected: All PASS (no behavior change to existing code)

- [ ] **Step 3: Commit**

```bash
git add src/db/openBrainDatabaseManager.ts
git commit -m "feat: add updateThoughtForUrlIngest() DB method"
```

---

### Task 5: Extract `ingestUrlContent()` helper from `ingestUrl()`

**Files:**
- Modify: `src/logic/thoughts.ts`

- [ ] **Step 1: Add `ingestUrlContent()` method**

Add to `ThoughtManager` class in `src/logic/thoughts.ts`, before `ingestUrl()` (around line 325):

```typescript
  /**
   * Fetch URL content, chunk it if needed, and create chunk embeddings for a thought.
   * Returns the extracted content on success, null on failure.
   * Shared by ingestUrl() and auto URL detection in capture().
   */
  async ingestUrlContent(thoughtId: string, url: string): Promise<ExtractedContent | null> {
    const content = await extractUrlContent(url);
    if (!content) {
      console.warn(`[OpenBrain:IngestContent] Failed to fetch ${url}`);
      return null;
    }

    // Chunk and embed the full content if it's long
    if (needsChunking(content.text)) {
      const chunks = chunkText(content.text);
      console.log(`[OpenBrain:IngestContent] Chunking ${content.text.length} chars into ${chunks.length} chunks`);

      for (const chunk of chunks) {
        const dbChunk = this.db.createChunk({
          thoughtId,
          chunkIndex: chunk.index,
          text: chunk.text,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
        });

        const embedding = await generateEmbedding(
          chunk.text,
          this.config.embedding.ollamaUrl,
          this.config.embedding.model
        );
        if (embedding) {
          this.db.storeChunkEmbedding(dbChunk.id, embedding);
        }
      }

      console.log(`[OpenBrain:IngestContent] ${url} — ${chunks.length} chunks embedded`);
    } else {
      console.log(`[OpenBrain:IngestContent] Content short enough, no chunking needed`);
    }

    return content;
  }
```

- [ ] **Step 2: Add `ExtractedContent` to imports**

Add `ExtractedContent` to the import from `./extractor.ts` at the top of `src/logic/thoughts.ts`:

```typescript
import { extractUrlContent, type ExtractedContent } from "./extractor.ts";
```

- [ ] **Step 3: Refactor `ingestUrl()` to use `ingestUrlContent()`**

Replace the body of `ingestUrl()` in `src/logic/thoughts.ts` (lines 329-384) to delegate to `ingestUrlContent()`:

```typescript
  async ingestUrl(url: string, lifeArea?: LifeArea): Promise<Thought | null> {
    // Fetch and get content via shared helper (no thought yet — we need content first)
    const content = await this.fetchUrlContent(url);
    if (!content) {
      return null;
    }

    // Create a summary for the thought text (title + first 500 chars)
    const preview = content.text.length > 500
      ? content.text.substring(0, 500) + "..."
      : content.text;
    const thoughtText = `${content.title}\n\n${preview}`;

    // Store as a reference thought with source_url (capture skips URL detection for "reference" type)
    const thought = await this.capture(
      thoughtText,
      "api",
      { url: content.url, title: content.title, fetchedAt: content.fetchedAt },
      "reference",
      undefined,
      lifeArea,
      url
    );

    // Chunk and embed using shared helper (pass already-fetched content)
    await this.chunkAndEmbed(thought.id, content);

    return this.db.getThought(thought.id) || thought;
  }
```

Also split `ingestUrlContent()` into two methods to avoid double-fetching:

```typescript
  /**
   * Fetch URL content only. Returns null on failure.
   */
  async fetchUrlContent(url: string): Promise<ExtractedContent | null> {
    const content = await extractUrlContent(url);
    if (!content) {
      console.warn(`[OpenBrain:IngestContent] Failed to fetch ${url}`);
      return null;
    }
    return content;
  }

  /**
   * Chunk and embed already-fetched content for a thought.
   */
  async chunkAndEmbed(thoughtId: string, content: ExtractedContent): Promise<void> {
    if (needsChunking(content.text)) {
      const chunks = chunkText(content.text);
      console.log(`[OpenBrain:IngestContent] Chunking ${content.text.length} chars into ${chunks.length} chunks`);

      for (const chunk of chunks) {
        const dbChunk = this.db.createChunk({
          thoughtId,
          chunkIndex: chunk.index,
          text: chunk.text,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
        });

        const embedding = await generateEmbedding(
          chunk.text,
          this.config.embedding.ollamaUrl,
          this.config.embedding.model
        );
        if (embedding) {
          this.db.storeChunkEmbedding(dbChunk.id, embedding);
        }
      }

      console.log(`[OpenBrain:IngestContent] ${content.url} — ${chunks.length} chunks embedded`);
    } else {
      console.log(`[OpenBrain:IngestContent] Content short enough, no chunking needed`);
    }
  }
```

Update the original `ingestUrlContent()` to use these two methods:

```typescript
  /**
   * Fetch URL content, chunk it if needed, and create chunk embeddings for a thought.
   * Returns the extracted content on success, null on failure.
   * Used by auto URL detection in capture().
   */
  async ingestUrlContent(thoughtId: string, url: string): Promise<ExtractedContent | null> {
    const content = await this.fetchUrlContent(url);
    if (!content) return null;
    await this.chunkAndEmbed(thoughtId, content);
    return content;
  }
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `deno test --allow-all src/tests/standalone_test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/logic/thoughts.ts
git commit -m "refactor: extract ingestUrlContent() from ingestUrl()"
```

---

## Chunk 3: Capture Integration

### Task 6: Wire URL detection into `capture()`

**Files:**
- Modify: `src/logic/thoughts.ts`

This is the core integration. The `capture()` method needs to:
1. Detect URLs in the text (skip if `thoughtType === "reference"`)
2. For URL-only: skip classification, fetch content, update thought, re-embed, re-classify
3. For URL-mentioned: set `source_url`, spawn ingestion for each URL

- [ ] **Step 1: Add URL detection imports**

Add to imports at top of `src/logic/thoughts.ts`:

```typescript
import { extractUrls, isUrlOnlyMessage } from "./url-detection.ts";
```

- [ ] **Step 2: Modify `capture()` to detect URLs and branch behavior**

Replace the `capture()` method body (lines 57-109 of `src/logic/thoughts.ts`) with:

```typescript
  async capture(
    text: string,
    sourceChannel: SourceChannel = "api",
    metadata?: Record<string, unknown>,
    thoughtType?: ThoughtType,
    topic?: string,
    lifeArea?: LifeArea,
    sourceUrl?: string
  ): Promise<Thought> {
    const thought = this.db.createThought({
      text,
      thought_type: thoughtType,
      topic,
      life_area: lifeArea,
      source_channel: sourceChannel,
      source_url: sourceUrl,
      metadata,
    });

    console.log(`[OpenBrain:Capture] Stored thought ${thought.id} (${text.length} chars)`);

    // Detect URLs (skip for reference thoughts to prevent recursion with ingestUrl)
    const detectedUrls = thoughtType === "reference" ? [] : extractUrls(text);
    const isUrlOnly = detectedUrls.length > 0 && isUrlOnlyMessage(text, detectedUrls);

    // Fetch managed topics for classification prompt
    const managedTopics = this.db.getManagedTopicNames();

    if (isUrlOnly) {
      // URL-ONLY: skip initial embed/classify, fetch content, smart-replace, then embed+classify
      await this.handleUrlOnlyCapture(thought, detectedUrls, managedTopics);
    } else {
      // NORMAL or URL-MENTIONED: embed and classify concurrently
      const asyncWork: Promise<unknown>[] = [
        generateEmbedding(text, this.config.embedding.ollamaUrl, this.config.embedding.model)
          .then((embedding) => {
            if (embedding) {
              this.db.storeEmbedding(thought.id, embedding);
              console.log(`[OpenBrain:Capture] Embedded thought ${thought.id}`);
            } else {
              console.warn(`[OpenBrain:Capture] Embedding skipped for ${thought.id}`);
            }
          }),
        classifyThought(text, this.config.llm.provider, this.config.llm.model, managedTopics)
          .then((classification) => {
            if (classification) {
              this.db.updateClassification(thought.id, classification);
              console.log(`[OpenBrain:Capture] Classified thought ${thought.id} as ${classification.thought_type}, area=${classification.life_area}`);
              for (const suggested of classification.suggested_topics) {
                this.db.suggestTopic(suggested, thought.id);
              }
            } else {
              console.warn(`[OpenBrain:Capture] Classification skipped for ${thought.id}`);
            }
          }),
      ];

      // URL-MENTIONED: also set source_url and spawn ingestion for each URL
      if (detectedUrls.length > 0) {
        // Set source_url to first detected URL
        this.db.updateThoughtForUrlIngest(thought.id, {
          text: thought.text,
          thought_type: thought.thought_type,
          source_url: detectedUrls[0],
          metadata: thought.metadata || {},
        });

        // Ingest each URL as a separate reference thought
        for (const url of detectedUrls) {
          asyncWork.push(
            this.ingestUrl(url, lifeArea).catch((err) => {
              console.warn(`[OpenBrain:Capture] URL ingestion failed for ${url}: ${err}`);
            })
          );
        }
      }

      await Promise.allSettled(asyncWork);
    }

    return this.db.getThought(thought.id) || thought;
  }
```

- [ ] **Step 3: Add `handleUrlOnlyCapture()` private method**

Add to `ThoughtManager` class, after `capture()`:

```typescript
  /**
   * Handle URL-only messages: fetch URL content, replace thought text,
   * then embed and classify using the fetched content.
   */
  private async handleUrlOnlyCapture(
    thought: Thought,
    urls: string[],
    managedTopics: string[]
  ): Promise<void> {
    const primaryUrl = urls[0];

    // Fetch and chunk the primary URL
    const content = await this.ingestUrlContent(thought.id, primaryUrl);

    if (content) {
      // Smart replace: update thought with fetched content
      const preview = content.text.length > 500
        ? content.text.substring(0, 500) + "..."
        : content.text;
      const newText = `${content.title}\n\n${preview}`;

      this.db.updateThoughtForUrlIngest(thought.id, {
        text: newText,
        thought_type: "reference",
        source_url: primaryUrl,
        metadata: {
          ...(thought.metadata || {}),
          url: content.url,
          title: content.title,
          fetchedAt: content.fetchedAt,
        },
      });

      console.log(`[OpenBrain:Capture] Smart-replaced thought ${thought.id} with content from ${primaryUrl}`);

      // Re-embed and re-classify with the fetched content
      const [embResult, classResult] = await Promise.allSettled([
        generateEmbedding(newText, this.config.embedding.ollamaUrl, this.config.embedding.model),
        classifyThought(newText, this.config.llm.provider, this.config.llm.model, managedTopics),
      ]);

      if (embResult.status === "fulfilled" && embResult.value) {
        this.db.storeEmbedding(thought.id, embResult.value);
        console.log(`[OpenBrain:Capture] Re-embedded thought ${thought.id} with fetched content`);
      }

      if (classResult.status === "fulfilled" && classResult.value) {
        this.db.updateClassification(thought.id, classResult.value);
        console.log(`[OpenBrain:Capture] Classified ingested thought ${thought.id}`);
        for (const suggested of classResult.value.suggested_topics) {
          this.db.suggestTopic(suggested, thought.id);
        }
      }
    } else {
      // Fetch failed — fall back to normal embed/classify on original text
      console.warn(`[OpenBrain:Capture] URL fetch failed for ${primaryUrl}, falling back to normal capture`);

      // Still set source_url so we know a URL was intended
      this.db.updateThoughtForUrlIngest(thought.id, {
        text: thought.text,
        thought_type: thought.thought_type,
        source_url: primaryUrl,
        metadata: thought.metadata || {},
      });

      const [embResult, classResult] = await Promise.allSettled([
        generateEmbedding(thought.text, this.config.embedding.ollamaUrl, this.config.embedding.model),
        classifyThought(thought.text, this.config.llm.provider, this.config.llm.model, managedTopics),
      ]);

      if (embResult.status === "fulfilled" && embResult.value) {
        this.db.storeEmbedding(thought.id, embResult.value);
      }
      if (classResult.status === "fulfilled" && classResult.value) {
        this.db.updateClassification(thought.id, classResult.value);
        for (const suggested of classResult.value.suggested_topics) {
          this.db.suggestTopic(suggested, thought.id);
        }
      }
    }

    // Ingest remaining URLs (if multi-URL message) as separate references
    for (const url of urls.slice(1)) {
      try {
        await this.ingestUrl(url);
      } catch (err) {
        console.warn(`[OpenBrain:Capture] Secondary URL ingestion failed for ${url}: ${err}`);
      }
    }
  }
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `deno test --allow-all src/tests/standalone_test.ts`
Expected: All PASS

- [ ] **Step 5: Verify the full project type-checks**

Run: `deno check src/main.ts`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add src/logic/thoughts.ts
git commit -m "feat: wire URL auto-detection into capture()"
```

---

## Chunk 4: Verification & Cleanup

### Task 7: Run full verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `deno task verify`
Expected: Type check, lint, and tests all pass

- [ ] **Step 2: Fix any lint or type issues**

If `deno task verify` reports issues, fix them in the relevant files.

- [ ] **Step 3: Rebuild dev instance and smoke test**

```bash
docker compose up -d --build
```

Wait for services to be healthy, then test via the API:

```bash
# Test 1: URL-only message
curl -s http://localhost:4012/thoughts -X POST \
  -H "Content-Type: application/json" \
  -d '{"text": "https://example.com", "source_channel": "web"}' | jq .

# Test 2: URL-mentioned message
curl -s http://localhost:4012/thoughts -X POST \
  -H "Content-Type: application/json" \
  -d '{"text": "I was reading https://example.com and it got me thinking", "source_channel": "web"}' | jq .

# Test 3: No URL (normal thought)
curl -s http://localhost:4012/thoughts -X POST \
  -H "Content-Type: application/json" \
  -d '{"text": "Just a normal thought about breakfast", "source_channel": "web"}' | jq .
```

Verify:
- Test 1: thought has `thought_type: "reference"`, `source_url` set, text replaced with fetched content
- Test 2: thought kept as-is, `source_url` set to the URL, separate reference thought created
- Test 3: normal behavior, no `source_url`

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address verification issues for auto URL detection"
```
