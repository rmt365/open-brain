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
    lifeArea?: LifeArea
  ): Promise<Thought> {
    const thought = this.db.createThought({
      text,
      thought_type: thoughtType,
      topic,
      life_area: lifeArea,
      source_channel: sourceChannel,
      metadata,
    });

    console.log(`[OpenBrain:Capture] Stored thought ${thought.id} (${text.length} chars)`);

    // Fetch managed topics for classification prompt
    const managedTopics = this.db.getManagedTopicNames();

    // Embed and classify concurrently — they're independent
    const [embResult, classResult] = await Promise.allSettled([
      generateEmbedding(text, this.config.embedding.ollamaUrl, this.config.embedding.model),
      classifyThought(text, this.config.llm.provider, this.config.llm.model, managedTopics),
    ]);

    if (embResult.status === "fulfilled" && embResult.value) {
      this.db.storeEmbedding(thought.id, embResult.value);
      console.log(`[OpenBrain:Capture] Embedded thought ${thought.id}`);
    } else {
      console.warn(`[OpenBrain:Capture] Embedding skipped for ${thought.id}`);
    }

    if (classResult.status === "fulfilled" && classResult.value) {
      const c = classResult.value;
      this.db.updateClassification(thought.id, c);
      console.log(`[OpenBrain:Capture] Classified thought ${thought.id} as ${c.thought_type}, area=${c.life_area}`);

      // Store any suggested topics
      for (const suggested of c.suggested_topics) {
        this.db.suggestTopic(suggested, thought.id);
        console.log(`[OpenBrain:Capture] Topic suggestion: "${suggested}" from thought ${thought.id}`);
      }
    } else {
      console.warn(`[OpenBrain:Capture] Classification skipped for ${thought.id}`);
    }

    return this.db.getThought(thought.id) || thought;
  }

  // ============================================================
  // SEARCH FLOW
  // ============================================================

  /** Semantic search with text LIKE fallback when embedding is unavailable. */
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

    if (queryEmbedding) {
      return this.semanticSearch(queryEmbedding, thoughtType, limit);
    }

    console.log("[OpenBrain:Search] Embedding unavailable, falling back to text search");
    return this.textSearch(query, thoughtType, limit);
  }

  /** VSS search with single-query JOIN (avoids N+1 per-thought fetches). */
  private semanticSearch(
    queryEmbedding: Float32Array,
    thoughtType?: ThoughtType,
    limit: number = 20
  ): SearchResult[] {
    const fetchLimit = thoughtType ? limit * 3 : limit;
    const vssResults = this.db.vssSearchWithThoughts(queryEmbedding, fetchLimit);

    if (vssResults.length === 0) {
      console.log("[OpenBrain:Search] No VSS results found");
      return [];
    }

    const results: SearchResult[] = [];
    let rank = 1;

    for (const { thought, distance } of vssResults) {
      if (results.length >= limit) break;
      if (thoughtType && thought.thought_type !== thoughtType) continue;

      results.push({
        thought,
        similarity: 1 / (1 + distance),
        rank: rank++,
      });
    }

    console.log(`[OpenBrain:Search] Semantic search returned ${results.length} results`);
    return results;
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
  // STATS
  // ============================================================

  getStats(): BrainStats {
    return this.db.getStats();
  }

  getTopics(): Array<{ topic: string; count: number }> {
    return this.db.getTopicCounts();
  }
}
