import type { OpenBrainDatabaseManager } from "../db/openBrainDatabaseManager.ts";
import type { ServiceConfig } from "../config.ts";
import type {
  Thought,
  ThoughtType,
  LifeArea,
  SourceChannel,
  SearchResult,
  BrainStats,
  ListThoughtsRequest,
  UpdateThoughtRequest,
  ListResponse,
} from "../types/index.ts";
import { generateEmbedding } from "./embeddings.ts";
import { classifyThought } from "./classifier.ts";
import { extractUrlContent, type ExtractedContent } from "./extractor.ts";
import { chunkText, needsChunking } from "./chunker.ts";
import { extractUrls, isUrlOnlyMessage } from "./url-detection.ts";

/** Process items in chunks with bounded concurrency */
export async function processInChunks<T>(
  items: T[],
  fn: (item: T) => Promise<boolean>,
  concurrency: number
): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const results = await Promise.allSettled(chunk.map(fn));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) processed++;
      else failed++;
    }
  }
  return { processed, failed };
}

/**
 * Graceful degradation: if Ollama or LLM provider is unavailable,
 * capture still works (thought stored, embed/classify deferred).
 * Search falls back to text LIKE matching.
 */
export class ThoughtManager {
  private db: OpenBrainDatabaseManager;
  private config: ServiceConfig;

  constructor(db: OpenBrainDatabaseManager, config: ServiceConfig) {
    this.db = db;
    this.config = config;
  }

  // ============================================================
  // CAPTURE FLOW
  // ============================================================

  /** Capture a thought: store immediately, then embed + classify. */
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

  // ============================================================
  // SEARCH FLOW
  // ============================================================

  /**
   * Hybrid search: runs semantic (vector) and text (keyword) search in parallel,
   * merges results, and boosts exact keyword matches. Falls back to text-only
   * when embeddings are unavailable.
   */
  async search(
    query: string,
    thoughtType?: ThoughtType,
    limit: number = 20
  ): Promise<SearchResult[]> {
    const queryEmbedding = await generateEmbedding(
      query,
      this.config.embedding.ollamaUrl,
      this.config.embedding.model
    );

    if (!queryEmbedding) {
      console.log("[OpenBrain:Search] Embedding unavailable, text search only");
      return this.textSearch(query, thoughtType, limit);
    }

    // Run both searches
    const semanticResults = this.semanticSearchWithChunks(queryEmbedding, thoughtType, limit);
    const textResults = this.textSearch(query, thoughtType, limit);

    // Merge: use a map keyed by thought ID, combine scores
    const merged = new Map<string, { thought: Thought; score: number; sources: string[] }>();

    // Semantic results: similarity is 0-1
    for (const r of semanticResults) {
      merged.set(r.thought.id, {
        thought: r.thought,
        score: r.similarity,
        sources: ["semantic"],
      });
    }

    // Text results: boost keyword matches, especially exact matches
    for (const r of textResults) {
      const existing = merged.get(r.thought.id);
      if (existing) {
        // Found in both — boost score significantly
        existing.score = Math.min(existing.score + r.similarity * 0.5, 1.0);
        existing.sources.push("text");
      } else {
        // Text-only match — use text similarity with slight penalty
        merged.set(r.thought.id, {
          thought: r.thought,
          score: r.similarity * 0.8,
          sources: ["text"],
        });
      }
    }

    // Sort by combined score, filter by minimum threshold, take top N
    const sorted = Array.from(merged.values())
      .sort((a, b) => b.score - a.score)
      .filter((s) => s.score >= 0.3)
      .slice(0, limit);

    console.log(`[OpenBrain:Search] Hybrid search: ${semanticResults.length} semantic + ${textResults.length} text → ${sorted.length} merged`);

    return sorted.map((s, i) => ({
      thought: s.thought,
      similarity: s.score,
      rank: i + 1,
    }));
  }

  private textSearch(
    query: string,
    thoughtType?: ThoughtType,
    limit: number = 20
  ): SearchResult[] {
    const { thoughts } = this.db.listThoughts({
      thought_type: thoughtType,
      status: "active",
      limit: limit * 2, // fetch extra to allow filtering
    });

    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(Boolean);

    const scored = thoughts
      .map((thought) => {
        const textLower = thought.text.toLowerCase();
        const topicLower = (thought.topic || "").toLowerCase();
        const autoTopicsLower = (thought.auto_topics || []).join(" ").toLowerCase();

        let matchCount = 0;
        for (const term of queryTerms) {
          if (textLower.includes(term)) matchCount++;
          if (topicLower.includes(term)) matchCount += 0.5;
          if (autoTopicsLower.includes(term)) matchCount += 0.3;
        }

        const similarity = queryTerms.length > 0
          ? matchCount / queryTerms.length
          : 0;

        return { thought, similarity };
      })
      .filter((s) => s.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    console.log(`[OpenBrain:Search] Text search returned ${scored.length} results`);

    return scored.map((s, i) => ({
      thought: s.thought,
      similarity: Math.min(s.similarity, 1.0), // cap at 1.0
      rank: i + 1,
    }));
  }

  // ============================================================
  // CRUD PASSTHROUGH
  // ============================================================

  get(id: string): Thought | null {
    return this.db.getThought(id);
  }

  list(filters: ListThoughtsRequest): ListResponse<Thought> {
    const { thoughts, total } = this.db.listThoughts(filters);
    return {
      items: thoughts,
      total,
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    };
  }

  update(id: string, data: UpdateThoughtRequest): Thought | null {
    return this.db.updateThought(id, data);
  }

  delete(id: string): boolean {
    return this.db.deleteThought(id);
  }

  // ============================================================
  // RE-PROCESSING
  // ============================================================

  async reclassify(id: string): Promise<Thought | null> {
    const thought = this.db.getThought(id);
    if (!thought) return null;

    const managedTopics = this.db.getManagedTopicNames();
    const classification = await classifyThought(
      thought.text,
      this.config.llm.provider,
      this.config.llm.model,
      managedTopics
    );

    if (classification) {
      this.db.updateClassification(id, classification);
      console.log(`[OpenBrain:Reclassify] ${id} -> ${classification.thought_type}, area=${classification.life_area}`);

      for (const suggested of classification.suggested_topics) {
        this.db.suggestTopic(suggested, id);
      }
    }

    return this.db.getThought(id);
  }

  async reembed(id: string): Promise<Thought | null> {
    const thought = this.db.getThought(id);
    if (!thought) return null;

    const embedding = await generateEmbedding(
      thought.text,
      this.config.embedding.ollamaUrl,
      this.config.embedding.model
    );

    if (embedding) {
      this.db.storeEmbedding(id, embedding);
      console.log(`[OpenBrain:Reembed] ${id} embedded successfully`);
    }

    return this.db.getThought(id);
  }

  async processUnembedded(batchSize: number = 50): Promise<{ processed: number; failed: number }> {
    const thoughts = this.db.getUnembeddedThoughts(batchSize);
    const result = await processInChunks(thoughts, async (thought) => {
      const embedding = await generateEmbedding(
        thought.text,
        this.config.embedding.ollamaUrl,
        this.config.embedding.model
      );
      if (embedding) {
        this.db.storeEmbedding(thought.id, embedding);
        return true;
      }
      return false;
    }, 5);

    console.log(`[OpenBrain:ProcessUnembedded] ${result.processed} processed, ${result.failed} failed`);
    return result;
  }

  async processUnclassified(batchSize: number = 50): Promise<{ processed: number; failed: number }> {
    const thoughts = this.db.getUnclassifiedThoughts(batchSize);
    const managedTopics = this.db.getManagedTopicNames();
    const result = await processInChunks(thoughts, async (thought) => {
      const classification = await classifyThought(
        thought.text,
        this.config.llm.provider,
        this.config.llm.model,
        managedTopics
      );
      if (classification) {
        this.db.updateClassification(thought.id, classification);
        for (const suggested of classification.suggested_topics) {
          this.db.suggestTopic(suggested, thought.id);
        }
        return true;
      }
      return false;
    }, 3);

    console.log(`[OpenBrain:ProcessUnclassified] ${result.processed} processed, ${result.failed} failed`);
    return result;
  }

  /** Reclassify thoughts that are missing life area assignment. */
  async processMissingLifeArea(batchSize: number = 50): Promise<{ processed: number; failed: number }> {
    const thoughts = this.db.getThoughtsMissingLifeArea(batchSize);
    const managedTopics = this.db.getManagedTopicNames();
    const result = await processInChunks(thoughts, async (thought) => {
      const classification = await classifyThought(
        thought.text,
        this.config.llm.provider,
        this.config.llm.model,
        managedTopics
      );
      if (classification) {
        this.db.updateClassification(thought.id, classification);
        for (const suggested of classification.suggested_topics) {
          this.db.suggestTopic(suggested, thought.id);
        }
        return true;
      }
      return false;
    }, 3);

    console.log(`[OpenBrain:ProcessMissingLifeArea] ${result.processed} processed, ${result.failed} failed`);
    return result;
  }

  // ============================================================
  // URL INGESTION
  // ============================================================

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

  /**
   * Ingest a URL: fetch content, store as a reference thought, chunk and embed.
   * The thought text stores a summary/title; chunks store the full content for search.
   */
  async ingestUrl(url: string, lifeArea?: LifeArea): Promise<Thought | null> {
    const content = await this.fetchUrlContent(url);
    if (!content) {
      console.error(`[OpenBrain:Ingest] Failed to extract content from ${url}`);
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

  // ============================================================
  // SEARCH (with chunk support)
  // ============================================================

  /**
   * Enhanced semantic search that also searches through URL-ingested chunks.
   * Chunk hits return their parent thought, deduplicated with direct thought hits.
   */
  private semanticSearchWithChunks(
    queryEmbedding: Float32Array,
    thoughtType?: ThoughtType,
    limit: number = 20
  ): SearchResult[] {
    // Search both thoughts and chunks
    const thoughtResults = this.db.vssSearchWithThoughts(queryEmbedding, limit * 2);
    const chunkResults = this.db.vssSearchChunksWithThoughts(queryEmbedding, limit);

    // Merge and deduplicate by thought ID
    const seen = new Map<string, { thought: Thought; distance: number }>();

    for (const { thought, distance } of thoughtResults) {
      const existing = seen.get(thought.id);
      if (!existing || distance < existing.distance) {
        seen.set(thought.id, { thought, distance });
      }
    }

    for (const { thought, distance } of chunkResults) {
      const existing = seen.get(thought.id);
      if (!existing || distance < existing.distance) {
        seen.set(thought.id, { thought, distance });
      }
    }

    // Sort by distance and apply filters
    const sorted = Array.from(seen.values())
      .sort((a, b) => a.distance - b.distance);

    const results: SearchResult[] = [];
    let rank = 1;

    for (const { thought, distance } of sorted) {
      if (results.length >= limit) break;
      if (thoughtType && thought.thought_type !== thoughtType) continue;

      const similarity = 1 / (1 + distance);
      if (similarity < 0.3) break; // below this threshold, results are noise
      results.push({
        thought,
        similarity,
        rank: rank++,
      });
    }

    console.log(`[OpenBrain:Search] Combined search returned ${results.length} results (${thoughtResults.length} thought + ${chunkResults.length} chunk hits)`);
    return results;
  }

  // ============================================================
  // SURFACING FORGOTTEN THOUGHTS
  // ============================================================

  /**
   * Surface old thoughts that haven't been seen in a while.
   * Returns them and marks them as surfaced so they don't repeat immediately.
   */
  surfaceForgotten(options: {
    minAgeDays?: number;
    limit?: number;
    lifeArea?: LifeArea;
  } = {}): Thought[] {
    const thoughts = this.db.getForgottenThoughts(options);

    if (thoughts.length > 0) {
      this.db.markAsSurfaced(thoughts.map((t) => t.id));
      console.log(`[OpenBrain:Surface] Surfaced ${thoughts.length} forgotten thoughts`);
    }

    return thoughts;
  }

  // ============================================================
  // STATS
  // ============================================================

  getStats(): BrainStats {
    return this.db.getStats();
  }

  getTopics(): Array<{ topic: string; count: number }> {
    return this.db.getTopicCounts();
  }

  // ============================================================
  // BRAIN QUERY (RAG)
  // ============================================================

  /** Ask a question against the brain. Searches for context, then synthesizes an answer via LLM. */
  async queryBrain(question: string): Promise<string> {
    // 1. Search for relevant thoughts
    const searchResults = await this.search(question, undefined, 10);

    // 2. Get taste preferences for additional context
    const preferences = this.db.listPreferences();

    // 3. Build context
    const thoughtContext = searchResults.length > 0
      ? searchResults.map((r, i) => {
          const t = r.thought;
          const date = new Date(t.created_at).toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric",
          });
          const parts = [`[${i + 1}] (${t.thought_type}, ${date}, ${(r.similarity * 100).toFixed(0)}% match)`];
          parts.push(t.text);
          if (t.auto_topics?.length) parts.push(`Topics: ${t.auto_topics.join(", ")}`);
          if (t.auto_life_area) parts.push(`Life area: ${t.auto_life_area}`);
          return parts.join("\n");
        }).join("\n\n")
      : "No relevant thoughts found in the brain.";

    const prefContext = preferences.length > 0
      ? preferences.map(p => `- ${p.preference_name} (${p.domain}): want "${p.want}", reject "${p.reject}"`).join("\n")
      : "";

    const system = [
      "You are Open Brain, a personal knowledge assistant. The user is querying their own brain — a collection of their captured thoughts, ideas, notes, and preferences.",
      "Answer the question based on the context provided. Be concise and direct.",
      "If the context doesn't contain enough information, say so honestly.",
      "Reference specific thoughts when relevant (by their number in brackets).",
    ].join(" ");

    const userPrompt = [
      `Question: ${question}`,
      "",
      "## Relevant thoughts from the brain:",
      thoughtContext,
      ...(prefContext ? ["", "## User preferences:", prefContext] : []),
    ].join("\n");

    // 4. Call LLM
    const answer = await this.config.llm.provider.complete(system, userPrompt, this.config.llm.model);

    if (!answer) {
      // Fallback: return raw search results
      if (searchResults.length === 0) {
        return "I couldn't find anything relevant in your brain for that question.";
      }
      return "I found some relevant thoughts but couldn't synthesize an answer:\n\n" + thoughtContext;
    }

    return answer;
  }
}
