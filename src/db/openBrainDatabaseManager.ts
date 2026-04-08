import { BaseDatabaseManager } from "@p2b/db-core";
import { join, dirname, fromFileUrl } from "@std/path";
import type {
  Thought,
  ThoughtType,
  SourceChannel,
  ThoughtStatus,
  Sentiment,
  LifeArea,
  LifeAreaConfig,
  ConstraintType,
  ArtifactType,
  BrainStats,
  CaptureThoughtRequest,
  UpdateThoughtRequest,
  ListThoughtsRequest,
  Preference,
  ConfigArtifact,
  ManagedTopic,
  SuggestedTopic,
  SuggestionStatus,
  ThoughtChunk,
  ApiKey,
  ApiKeyScope,
} from "../types/index.ts";
import type { ClassificationResult } from "../logic/classifier.ts";

const VSS_EXTENSIONS = [
  { path: "/usr/local/lib/sqlite3/extensions/vector0", envVar: "SQLITE_VECTOR_PATH" },
  { path: "/usr/local/lib/sqlite3/extensions/vss0", envVar: "SQLITE_VSS_PATH" },
];

export class OpenBrainDatabaseManager extends BaseDatabaseManager {
  /** Resolves when migrations and VSS setup are complete. Await in tests before querying. */
  readonly initialized: Promise<void>;

  constructor(dbPath?: string) {
    const migrationsDir = join(
      dirname(fromFileUrl(import.meta.url)),
      "migrations",
      "sql"
    );

    const resolvedDbPath = dbPath ||
      Deno.env.get("DATABASE_PATH") ||
      "/app/database/open-brain.db";

    console.log(`[OpenBrainDB] Initializing with database: ${resolvedDbPath}`);
    console.log(`[OpenBrainDB] Migrations directory: ${migrationsDir}`);

    super(resolvedDbPath, {
      migrateDatabase: false,
      loadExtensions: true,
      migrationsDir,
      extensions: VSS_EXTENSIONS,
    });

    // Run migrations then set up VSS — store the promise so callers can await readiness.
    this.initialized = this.runMigrations()
      .then(() => {
        const vssReady = this.createVSSTable();
        if (vssReady) {
          const { indexed } = this.rebuildVSSIndex();
          console.log(`[OpenBrainDB] VSS ready — ${indexed} embeddings indexed`);
          this.createChunkVSSTable();
        } else {
          console.log("[OpenBrainDB] VSS not available — search will use text fallback");
        }
      })
      .catch((err) => {
        console.error("[OpenBrainDB] Initialization failed:", err);
        throw err;
      });
  }

  // ============================================
  // Raw DB access (for extensions)
  // ============================================

  getRawDb() {
    return this.db;
  }

  // ============================================
  // VSS (Vector Similarity Search)
  // ============================================

  /** Create the VSS virtual table. Recreates if dimension mismatch detected. */
  createVSSTable(dimensions: number = 384): boolean {
    try {
      // Check if existing VSS table has wrong dimensions — recreate if so
      if (this.hasVSSTable()) {
        const row = this.db.prepare(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='vss_thoughts'"
        ).get() as { sql: string } | undefined;
        if (row?.sql && !row.sql.includes("embedding(" + String(dimensions) + ")")) {
          console.log("[OpenBrainDB] VSS dimension mismatch, recreating for " + dimensions + "d");
          this.db.prepare("DROP TABLE vss_thoughts").run();
          try { this.db.prepare("DROP TABLE vss_thought_chunks").run(); } catch { /* may not exist */ }
        }
      }

      this.db.prepare(
        "CREATE VIRTUAL TABLE IF NOT EXISTS vss_thoughts USING vss0(embedding(" + String(dimensions) + "))"
      ).run();
      console.log("[OpenBrainDB] VSS table vss_thoughts ready");
      return true;
    } catch (e) {
      console.warn("[OpenBrainDB] Could not create VSS table (extensions may not be loaded): " + e);
      return false;
    }
  }

  hasVSSTable(): boolean {
    try {
      const row = this.db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='vss_thoughts'`
      ).get() as { name: string } | undefined;
      return !!row;
    } catch {
      return false;
    }
  }

  /** Insert or update a single thought's embedding in the VSS index. */
  upsertVSSEmbedding(thoughtId: string): boolean {
    if (!this.hasVSSTable()) return false;

    try {
      const row = this.db.prepare(
        `SELECT _vss_rowid, embedding FROM thoughts WHERE id = ?`
      ).get(thoughtId) as { _vss_rowid: number; embedding: Uint8Array } | undefined;

      if (!row || !row.embedding || !row._vss_rowid) return false;

      this.db.prepare(
        `INSERT OR REPLACE INTO vss_thoughts(rowid, embedding) VALUES (?, ?)`
      ).run(row._vss_rowid, row.embedding);

      return true;
    } catch (e) {
      console.warn(`[OpenBrainDB] VSS upsert failed for ${thoughtId}: ${e}`);
      return false;
    }
  }

  /** Rebuild the entire VSS index from all thoughts with embeddings. */
  rebuildVSSIndex(): { indexed: number; skipped: number } {
    if (!this.hasVSSTable()) {
      const created = this.createVSSTable();
      if (!created) return { indexed: 0, skipped: 0 };
    }

    let indexed = 0;
    let skipped = 0;

    const transaction = this.db.transaction(() => {
      this.db.exec(`DELETE FROM vss_thoughts`);

      const rows = this.db.prepare(`
        SELECT _vss_rowid, embedding FROM thoughts
        WHERE embedding IS NOT NULL AND _vss_rowid IS NOT NULL
      `).all() as Array<{ _vss_rowid: number; embedding: Uint8Array }>;

      const insertStmt = this.db.prepare(
        `INSERT INTO vss_thoughts(rowid, embedding) VALUES (?, ?)`
      );

      for (const row of rows) {
        try {
          insertStmt.run(row._vss_rowid, row.embedding);
          indexed++;
        } catch (e) {
          console.warn(`[OpenBrainDB] VSS insert failed for rowid ${row._vss_rowid}: ${e}`);
          skipped++;
        }
      }
    });

    transaction();
    console.log(`[OpenBrainDB] VSS index rebuilt: ${indexed} indexed, ${skipped} skipped`);
    return { indexed, skipped };
  }

  /**
   * Perform vector similarity search, returning full thought rows.
   * Eliminates the N+1 problem of fetching each thought individually after VSS search.
   */
  vssSearchWithThoughts(
    queryEmbedding: Float32Array,
    limit: number = 20
  ): Array<{ thought: Thought; distance: number }> {
    if (!this.isVSSReady()) return [];

    try {
      const queryBytes = new Uint8Array(queryEmbedding.buffer);

      const rows = this.db.prepare(`
        SELECT t.*, sub.distance
        FROM (
          SELECT rowid, distance
          FROM vss_thoughts
          WHERE vss_search(embedding, ?)
          LIMIT ?
        ) sub
        JOIN thoughts t ON t._vss_rowid = sub.rowid
        WHERE t.status = 'active'
      `).all(queryBytes, limit) as Array<Record<string, unknown>>;

      return rows.map(row => ({
        thought: this.parseThoughtRow(row),
        distance: row.distance as number,
      }));
    } catch (e) {
      console.warn(`[OpenBrainDB] VSS search with thoughts failed: ${e}`);
      return [];
    }
  }

  /**
   * Perform vector similarity search returning IDs and distances only.
   * Kept for lightweight callers that don't need full thought rows.
   */
  vssSearch(queryEmbedding: Float32Array, limit: number = 20): Array<{ id: string; distance: number }> {
    if (!this.isVSSReady()) return [];

    try {
      const queryBytes = new Uint8Array(queryEmbedding.buffer);

      return this.db.prepare(`
        SELECT t.id, sub.distance
        FROM (
          SELECT rowid, distance
          FROM vss_thoughts
          WHERE vss_search(embedding, ?)
          LIMIT ?
        ) sub
        JOIN thoughts t ON t._vss_rowid = sub.rowid
        WHERE t.status = 'active'
      `).all(queryBytes, limit) as Array<{ id: string; distance: number }>;
    } catch (e) {
      console.warn(`[OpenBrainDB] VSS search failed: ${e}`);
      return [];
    }
  }

  /**
   * Check if the VSS index exists and has at least one entry.
   * Guards against FAISS 'k > 0' crash on empty indexes.
   */
  private isVSSReady(): boolean {
    if (!this.hasVSSTable()) {
      console.warn("[OpenBrainDB] VSS table not available for search");
      return false;
    }

    const row = this.db.prepare(
      `SELECT count(*) as cnt FROM vss_thoughts`
    ).get() as { cnt: number } | undefined;

    return !!row && row.cnt > 0;
  }

  // ============================================
  // THOUGHT CRUD
  // ============================================

  createThought(data: CaptureThoughtRequest): Thought {
    const id = crypto.randomUUID();

    const stmt = this.db.prepare(`
      INSERT INTO thoughts (
        id, text, thought_type, topic, life_area, source_channel, source_url, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.text,
      data.thought_type || "note",
      data.topic || null,
      data.life_area || null,
      data.source_channel || "api",
      data.source_url || null,
      data.metadata ? JSON.stringify(data.metadata) : null
    );

    return this.getThought(id)!;
  }

  getThought(id: string): Thought | null {
    const stmt = this.db.prepare("SELECT * FROM thoughts WHERE id = ?");
    const row = stmt.get(id) as Record<string, unknown> | undefined;

    if (!row) return null;

    return this.parseThoughtRow(row);
  }

  listThoughts(filters: ListThoughtsRequest = {}): { thoughts: Thought[]; total: number } {
    let query = "SELECT * FROM thoughts WHERE 1=1";
    let countQuery = "SELECT COUNT(*) as count FROM thoughts WHERE 1=1";
    const params: (string | number)[] = [];
    const countParams: (string | number)[] = [];

    if (filters.thought_type) {
      query += " AND thought_type = ?";
      countQuery += " AND thought_type = ?";
      params.push(filters.thought_type);
      countParams.push(filters.thought_type);
    }

    if (filters.source_channel) {
      query += " AND source_channel = ?";
      countQuery += " AND source_channel = ?";
      params.push(filters.source_channel);
      countParams.push(filters.source_channel);
    }

    if (filters.status) {
      query += " AND status = ?";
      countQuery += " AND status = ?";
      params.push(filters.status);
      countParams.push(filters.status);
    } else {
      // Default to active thoughts only
      query += " AND status = 'active'";
      countQuery += " AND status = 'active'";
    }

    if (filters.life_area === "unclassified") {
      query += " AND life_area IS NULL AND auto_life_area IS NULL";
      countQuery += " AND life_area IS NULL AND auto_life_area IS NULL";
    } else if (filters.life_area) {
      query += " AND (life_area = ? OR auto_life_area = ?)";
      countQuery += " AND (life_area = ? OR auto_life_area = ?)";
      params.push(filters.life_area, filters.life_area);
      countParams.push(filters.life_area, filters.life_area);
    }

    if (filters.topic) {
      query += " AND topic LIKE ?";
      countQuery += " AND topic LIKE ?";
      params.push(`%${filters.topic}%`);
      countParams.push(`%${filters.topic}%`);
    }

    if (filters.since) {
      query += " AND created_at >= ?";
      countQuery += " AND created_at >= ?";
      params.push(filters.since);
      countParams.push(filters.since);
    }

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const rows = this.db.prepare(query).all(...params) as Array<Record<string, unknown>>;
    const countRow = this.db.prepare(countQuery).get(...countParams) as { count: number };

    return {
      thoughts: rows.map((row) => this.parseThoughtRow(row)),
      total: countRow.count,
    };
  }

  updateThought(id: string, data: UpdateThoughtRequest): Thought | null {
    const existing = this.getThought(id);
    if (!existing) return null;

    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (data.text !== undefined) {
      updates.push("text = ?");
      params.push(data.text);
    }
    if (data.thought_type !== undefined) {
      updates.push("thought_type = ?");
      params.push(data.thought_type);
    }
    if (data.topic !== undefined) {
      updates.push("topic = ?");
      params.push(data.topic);
    }
    if (data.life_area !== undefined) {
      updates.push("life_area = ?");
      params.push(data.life_area);
    }
    if (data.status !== undefined) {
      updates.push("status = ?");
      params.push(data.status);
    }
    if (data.metadata !== undefined) {
      updates.push("metadata = ?");
      params.push(JSON.stringify(data.metadata));
    }

    if (updates.length === 0) {
      return existing;
    }

    params.push(id);

    const query = `UPDATE thoughts SET ${updates.join(", ")} WHERE id = ?`;
    this.db.prepare(query).run(...params);

    return this.getThought(id);
  }

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

  /** Soft-delete (sets status to 'deleted'). */
  deleteThought(id: string): boolean {
    const count = this.db.prepare(
      "UPDATE thoughts SET status = 'deleted' WHERE id = ? AND status != 'deleted'"
    ).run(id);
    return count > 0;
  }

  // ============================================
  // SUPERSESSION
  // ============================================

  /**
   * Mark a thought as superseded by a newer version.
   * Sets status to 'superseded' and records the ID of the replacement.
   */
  supersedeThought(oldId: string, newId: string): void {
    this.db.prepare(
      "UPDATE thoughts SET status = 'superseded', superseded_by = ? WHERE id = ?"
    ).run(newId, oldId);
  }

  /**
   * Return the full supersession chain for a thought, from the oldest
   * ancestor to the current active version.
   * superseded_by on a thought points to the newer thought that replaced it.
   */
  getSupersessionChain(id: string): Thought[] {
    // Walk backwards to find the root (the thought with no predecessor)
    let rootId = id;
    const visited = new Set<string>([rootId]);
    while (true) {
      const row = this.db.prepare(
        "SELECT id FROM thoughts WHERE superseded_by = ?"
      ).get(rootId) as { id: string } | undefined;
      if (!row || visited.has(row.id)) break;
      visited.add(row.id);
      rootId = row.id;
    }

    // Walk forward from root following superseded_by
    const chain: Thought[] = [];
    let current: string | null = rootId;
    while (current) {
      const thought = this.getThought(current);
      if (!thought) break;
      chain.push(thought);
      current = thought.superseded_by;
    }
    return chain;
  }

  // ============================================
  // CLASSIFICATION / EMBEDDING UPDATES
  // ============================================

  updateClassification(id: string, result: ClassificationResult): boolean {
    const count = this.db.prepare(`
      UPDATE thoughts
      SET auto_type = ?, auto_topics = ?, confidence = ?,
          auto_people = ?, auto_action_items = ?, auto_dates_mentioned = ?, auto_sentiment = ?,
          auto_life_area = ?
      WHERE id = ?
    `).run(
      result.thought_type,
      JSON.stringify(result.topics),
      result.confidence,
      JSON.stringify(result.people),
      JSON.stringify(result.action_items),
      JSON.stringify(result.dates_mentioned),
      result.sentiment,
      result.life_area || null,
      id
    );

    // Auto-assign topic from auto_topics if a managed topic matches
    if (count > 0) {
      this.assignTopicFromAutoTopics(id);
    }

    return count > 0;
  }

  /**
   * Assign topic and life_area from auto_topics when a managed topic matches.
   * Called after classification to close the gap between auto-classification
   * and topic assignment.
   */
  assignTopicFromAutoTopics(thoughtId: string): boolean {
    const count = this.db.prepare(`
      UPDATE thoughts SET
        topic = (
          SELECT mt.name FROM managed_topics mt, JSON_EACH(thoughts.auto_topics) je
          WHERE je.value = mt.name AND mt.active = 1 LIMIT 1
        ),
        life_area = COALESCE(thoughts.life_area, (
          SELECT mt.life_area FROM managed_topics mt, JSON_EACH(thoughts.auto_topics) je
          WHERE je.value = mt.name AND mt.active = 1 LIMIT 1
        ))
      WHERE id = ? AND topic IS NULL AND auto_topics IS NOT NULL
    `).run(thoughtId);
    return count > 0;
  }

  /**
   * Batch assign topics from auto_topics for all untagged thoughts.
   * Used for retroactive fix of existing data.
   */
  assignTopicsFromAutoTopicsBatch(): number {
    const count = this.db.prepare(`
      UPDATE thoughts SET
        topic = (
          SELECT mt.name FROM managed_topics mt, JSON_EACH(thoughts.auto_topics) je
          WHERE je.value = mt.name AND mt.active = 1 LIMIT 1
        ),
        life_area = COALESCE(life_area, (
          SELECT mt.life_area FROM managed_topics mt, JSON_EACH(thoughts.auto_topics) je
          WHERE je.value = mt.name AND mt.active = 1 LIMIT 1
        ))
      WHERE topic IS NULL AND auto_topics IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM managed_topics mt, JSON_EACH(thoughts.auto_topics) je
          WHERE je.value = mt.name AND mt.active = 1
        )
    `).run();
    return count;
  }

  /** Store an embedding and sync to VSS index. */
  storeEmbedding(
    id: string,
    embedding: Float32Array,
    model: string = "all-minilm"
  ): boolean {
    const embeddingBytes = new Uint8Array(embedding.buffer);

    const count = this.db.prepare(`
      UPDATE thoughts
      SET embedding = ?, embedding_model = ?
      WHERE id = ?
    `).run(embeddingBytes, model, id);

    if (count > 0) {
      this.upsertVSSEmbedding(id);
      return true;
    }
    return false;
  }

  getUnclassifiedThoughts(limit: number = 50): Thought[] {
    const rows = this.db.prepare(`
      SELECT * FROM thoughts
      WHERE auto_type IS NULL AND status = 'active'
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;

    return rows.map((row) => this.parseThoughtRow(row));
  }

  getUnembeddedThoughts(limit: number = 50): Thought[] {
    const rows = this.db.prepare(`
      SELECT * FROM thoughts
      WHERE embedding IS NULL AND status = 'active'
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;

    return rows.map((row) => this.parseThoughtRow(row));
  }

  // ============================================
  // STATS
  // ============================================

  getBreakdown(): import("../types/index.ts").BrainBreakdown {
    const rows = this.db.prepare(`
      SELECT
        COALESCE(life_area, auto_life_area, 'unclassified') as area,
        topic,
        COUNT(*) as count
      FROM thoughts
      WHERE status = 'active'
      GROUP BY area, topic
    `).all() as Array<{ area: string; topic: string | null; count: number }>;

    const result: import("../types/index.ts").BrainBreakdown = {
      by_life_area: {},
      unclassified: { count: 0, topics: {} },
    };

    for (const row of rows) {
      const topicName = row.topic || "(no topic)";
      if (row.area === "unclassified") {
        result.unclassified.count += row.count;
        result.unclassified.topics[topicName] = (result.unclassified.topics[topicName] || 0) + row.count;
      } else {
        if (!result.by_life_area[row.area]) {
          result.by_life_area[row.area] = { count: 0, topics: {} };
        }
        result.by_life_area[row.area].count += row.count;
        result.by_life_area[row.area].topics[topicName] = (result.by_life_area[row.area].topics[topicName] || 0) + row.count;
      }
    }

    return result;
  }

  getStats(): BrainStats {
    const total = (this.db.prepare(
      "SELECT COUNT(*) as count FROM thoughts WHERE status = 'active'"
    ).get() as { count: number }).count;

    const typeRows = this.db.prepare(`
      SELECT thought_type, COUNT(*) as count
      FROM thoughts WHERE status = 'active'
      GROUP BY thought_type
    `).all() as Array<{ thought_type: string; count: number }>;

    const by_type = {} as Record<ThoughtType, number>;
    for (const row of typeRows) {
      by_type[row.thought_type as ThoughtType] = row.count;
    }

    const channelRows = this.db.prepare(`
      SELECT source_channel, COUNT(*) as count
      FROM thoughts WHERE status = 'active'
      GROUP BY source_channel
    `).all() as Array<{ source_channel: string; count: number }>;

    const by_channel = {} as Record<SourceChannel, number>;
    for (const row of channelRows) {
      by_channel[row.source_channel as SourceChannel] = row.count;
    }

    const embedded_count = (this.db.prepare(
      "SELECT COUNT(*) as count FROM thoughts WHERE embedding IS NOT NULL AND status = 'active'"
    ).get() as { count: number }).count;

    const classified_count = (this.db.prepare(
      "SELECT COUNT(*) as count FROM thoughts WHERE auto_type IS NOT NULL AND status = 'active'"
    ).get() as { count: number }).count;

    const dateRange = this.db.prepare(`
      SELECT MIN(created_at) as oldest, MAX(created_at) as newest
      FROM thoughts WHERE status = 'active'
    `).get() as { oldest: string | null; newest: string | null };

    return {
      total_thoughts: total,
      by_type,
      by_channel,
      embedded_count,
      classified_count,
      oldest_thought: dateRange.oldest,
      newest_thought: dateRange.newest,
    };
  }

  getTopicCounts(): Array<{ topic: string; count: number }> {
    return this.db.prepare(`
      SELECT topic, COUNT(*) as count
      FROM thoughts
      WHERE topic IS NOT NULL AND status = 'active'
      GROUP BY topic
      ORDER BY count DESC
    `).all() as Array<{ topic: string; count: number }>;
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private parseThoughtRow(row: Record<string, unknown>): Thought {
    return {
      id: row.id as string,
      text: row.text as string,
      thought_type: (row.thought_type || "note") as ThoughtType,
      topic: (row.topic as string) || null,
      life_area: (row.life_area as LifeArea) || null,
      auto_life_area: (row.auto_life_area as LifeArea) || null,
      source_url: (row.source_url as string) || null,
      source_channel: (row.source_channel || "api") as SourceChannel,
      auto_type: (row.auto_type as ThoughtType) || null,
      auto_topics: row.auto_topics ? JSON.parse(row.auto_topics as string) : null,
      confidence: row.confidence as number | null,
      auto_people: row.auto_people ? JSON.parse(row.auto_people as string) : null,
      auto_action_items: row.auto_action_items ? JSON.parse(row.auto_action_items as string) : null,
      auto_dates_mentioned: row.auto_dates_mentioned ? JSON.parse(row.auto_dates_mentioned as string) : null,
      auto_sentiment: (row.auto_sentiment as Sentiment) || null,
      embedding_model: (row.embedding_model as string) || null,
      has_embedding: row.embedding !== null && row.embedding !== undefined,
      status: (row.status || "active") as ThoughtStatus,
      superseded_by: (row.superseded_by as string) || null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      last_surfaced: (row.last_surfaced as string) || null,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
    };
  }

  // ============================================
  // THOUGHT CHUNKS (URL ingestion)
  // ============================================

  /** Create VSS table for chunks. Recreates on dimension mismatch. */
  createChunkVSSTable(dimensions: number = 384): boolean {
    try {
      // Check if existing table has wrong dimensions — recreate if so
      const existing = this.db.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='vss_chunks'"
      ).get() as { sql: string } | undefined;

      let needsRebuild = false;
      if (existing?.sql && !existing.sql.includes("embedding(" + String(dimensions) + ")")) {
        console.log("[OpenBrainDB] vss_chunks dimension mismatch, recreating for " + dimensions + "d");
        this.db.prepare("DROP TABLE vss_chunks").run();
        needsRebuild = true;
      }

      this.db.prepare(
        "CREATE VIRTUAL TABLE IF NOT EXISTS vss_chunks USING vss0(embedding(" + String(dimensions) + "))"
      ).run();
      if (needsRebuild) this.rebuildChunkVSSIndex();
      console.log("[OpenBrainDB] VSS table vss_chunks ready");
      return true;
    } catch (e) {
      console.warn(`[OpenBrainDB] Could not create vss_chunks table: ${e}`);
      return false;
    }
  }

  /** Rebuild the chunk VSS index from all chunks with embeddings. */
  private rebuildChunkVSSIndex(): void {
    try {
      const rows = this.db.prepare(`
        SELECT _vss_rowid, embedding FROM thought_chunks
        WHERE embedding IS NOT NULL AND _vss_rowid IS NOT NULL
      `).all() as Array<{ _vss_rowid: number; embedding: Uint8Array }>;

      if (rows.length === 0) return;

      this.db.exec("DELETE FROM vss_chunks");
      const stmt = this.db.prepare(
        "INSERT INTO vss_chunks(rowid, embedding) VALUES (?, ?)"
      );
      let indexed = 0;
      for (const row of rows) {
        try {
          stmt.run(row._vss_rowid, row.embedding);
          indexed++;
        } catch (e) {
          console.warn(`[OpenBrainDB] VSS chunk insert failed for rowid ${row._vss_rowid}: ${e}`);
        }
      }
      console.log(`[OpenBrainDB] Chunk VSS index rebuilt: ${indexed} chunks indexed`);
    } catch (e) {
      console.warn(`[OpenBrainDB] Chunk VSS rebuild failed: ${e}`);
    }
  }

  createChunk(data: {
    thoughtId: string;
    chunkIndex: number;
    text: string;
    startOffset: number;
    endOffset: number;
  }): ThoughtChunk {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO thought_chunks (id, thought_id, chunk_index, text, start_offset, end_offset)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.thoughtId, data.chunkIndex, data.text, data.startOffset, data.endOffset);

    return this.getChunk(id)!;
  }

  getChunk(id: string): ThoughtChunk | null {
    const row = this.db.prepare(
      "SELECT * FROM thought_chunks WHERE id = ?"
    ).get(id) as Record<string, unknown> | undefined;
    return row ? this.parseChunkRow(row) : null;
  }

  getChunksForThought(thoughtId: string): ThoughtChunk[] {
    const rows = this.db.prepare(
      "SELECT * FROM thought_chunks WHERE thought_id = ? ORDER BY chunk_index"
    ).all(thoughtId) as Array<Record<string, unknown>>;
    return rows.map((row) => this.parseChunkRow(row));
  }

  storeChunkEmbedding(id: string, embedding: Float32Array, model: string = "all-minilm"): boolean {
    const embeddingBytes = new Uint8Array(embedding.buffer);
    const count = this.db.prepare(`
      UPDATE thought_chunks SET embedding = ?, embedding_model = ? WHERE id = ?
    `).run(embeddingBytes, model, id);

    if (count > 0) {
      this.upsertChunkVSSEmbedding(id);
      return true;
    }
    return false;
  }

  private upsertChunkVSSEmbedding(chunkId: string): boolean {
    try {
      const row = this.db.prepare(
        `SELECT _vss_rowid, embedding FROM thought_chunks WHERE id = ?`
      ).get(chunkId) as { _vss_rowid: number; embedding: Uint8Array } | undefined;

      if (!row || !row.embedding || !row._vss_rowid) return false;

      this.db.prepare(
        `INSERT OR REPLACE INTO vss_chunks(rowid, embedding) VALUES (?, ?)`
      ).run(row._vss_rowid, row.embedding);
      return true;
    } catch (e) {
      console.warn(`[OpenBrainDB] VSS chunk upsert failed for ${chunkId}: ${e}`);
      return false;
    }
  }

  /**
   * Search chunks via VSS, returning the parent thought for each hit.
   * Deduplicates by thought_id so you don't get the same thought multiple times.
   */
  vssSearchChunksWithThoughts(
    queryEmbedding: Float32Array,
    limit: number = 20
  ): Array<{ thought: Thought; distance: number; matchedChunkText: string }> {
    try {
      // Check if vss_chunks exists and has data
      const hasTable = (() => {
        try {
          const r = this.db.prepare(
            `SELECT name FROM sqlite_master WHERE type='table' AND name='vss_chunks'`
          ).get() as { name: string } | undefined;
          if (!r) return false;
          const cnt = this.db.prepare(`SELECT count(*) as cnt FROM vss_chunks`).get() as { cnt: number };
          return cnt.cnt > 0;
        } catch { return false; }
      })();

      if (!hasTable) return [];

      const queryBytes = new Uint8Array(queryEmbedding.buffer);

      const rows = this.db.prepare(`
        SELECT c.text as chunk_text, c.thought_id, sub.distance
        FROM (
          SELECT rowid, distance
          FROM vss_chunks
          WHERE vss_search(embedding, ?)
          LIMIT ?
        ) sub
        JOIN thought_chunks c ON c._vss_rowid = sub.rowid
      `).all(queryBytes, limit * 2) as Array<Record<string, unknown>>;

      // Deduplicate by thought_id, keeping best (lowest) distance
      const seen = new Map<string, { distance: number; chunkText: string }>();
      for (const row of rows) {
        const thoughtId = row.thought_id as string;
        const distance = row.distance as number;
        const existing = seen.get(thoughtId);
        if (!existing || distance < existing.distance) {
          seen.set(thoughtId, { distance, chunkText: row.chunk_text as string });
        }
      }

      const results: Array<{ thought: Thought; distance: number; matchedChunkText: string }> = [];
      for (const [thoughtId, { distance, chunkText }] of seen) {
        if (results.length >= limit) break;
        const thought = this.getThought(thoughtId);
        if (thought && thought.status === "active") {
          results.push({ thought, distance, matchedChunkText: chunkText });
        }
      }

      return results;
    } catch (e) {
      console.warn(`[OpenBrainDB] VSS chunk search failed: ${e}`);
      return [];
    }
  }

  getUnembeddedChunks(limit: number = 50): Array<ThoughtChunk & { thought_id: string }> {
    const rows = this.db.prepare(`
      SELECT * FROM thought_chunks
      WHERE embedding IS NULL
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;
    return rows.map((row) => this.parseChunkRow(row));
  }

  private parseChunkRow(row: Record<string, unknown>): ThoughtChunk {
    return {
      id: row.id as string,
      thought_id: row.thought_id as string,
      chunk_index: row.chunk_index as number,
      text: row.text as string,
      start_offset: row.start_offset as number,
      end_offset: row.end_offset as number,
      embedding_model: (row.embedding_model as string) || null,
      has_embedding: row.embedding !== null && row.embedding !== undefined,
      created_at: row.created_at as string,
    };
  }

  // ============================================
  // SURFACING FORGOTTEN THOUGHTS
  // ============================================

  /**
   * Get old thoughts that haven't been surfaced recently.
   * Prioritizes thoughts that are older and have never been surfaced.
   */
  getForgottenThoughts(options: {
    minAgeDays?: number;
    limit?: number;
    lifeArea?: LifeArea;
  } = {}): Thought[] {
    const minAge = options.minAgeDays ?? 30;
    const limit = options.limit ?? 5;

    let query = `
      SELECT * FROM thoughts
      WHERE status = 'active'
        AND created_at < datetime('now', '-${minAge} days')
        AND (last_surfaced IS NULL OR last_surfaced < datetime('now', '-7 days'))
    `;
    const params: (string | number)[] = [];

    if (options.lifeArea) {
      query += " AND (life_area = ? OR auto_life_area = ?)";
      params.push(options.lifeArea, options.lifeArea);
    }

    // Score: prioritize never-surfaced, then oldest surfaced
    query += `
      ORDER BY
        CASE WHEN last_surfaced IS NULL THEN 0 ELSE 1 END,
        COALESCE(last_surfaced, created_at) ASC
      LIMIT ?
    `;
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as Array<Record<string, unknown>>;
    return rows.map((row) => this.parseThoughtRow(row));
  }

  /** Mark thoughts as surfaced (updates last_surfaced timestamp). */
  markAsSurfaced(ids: string[]): void {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(",");
    this.db.prepare(
      `UPDATE thoughts SET last_surfaced = datetime('now') WHERE id IN (${placeholders})`
    ).run(...ids);
  }

  // ============================================
  // LIFE AREAS
  // ============================================

  getLifeAreas(activeOnly: boolean = true): LifeAreaConfig[] {
    const query = activeOnly
      ? "SELECT * FROM life_areas WHERE active = 1 ORDER BY sort_order"
      : "SELECT * FROM life_areas ORDER BY sort_order";
    const rows = this.db.prepare(query).all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.parseLifeAreaRow(row));
  }

  getLifeAreaNames(): string[] {
    const rows = this.db.prepare(
      "SELECT name FROM life_areas WHERE active = 1 ORDER BY sort_order"
    ).all() as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  addLifeArea(data: {
    name: string;
    label: string;
    description?: string;
    color: string;
    sort_order?: number;
  }): LifeAreaConfig {
    const sortOrder = data.sort_order ?? this.getNextLifeAreaSortOrder();
    this.db.prepare(
      "INSERT INTO life_areas (name, label, description, color, sort_order) VALUES (?, ?, ?, ?, ?)"
    ).run(
      data.name.toLowerCase().trim(),
      data.label,
      data.description || null,
      data.color,
      sortOrder,
    );

    const row = this.db.prepare(
      "SELECT * FROM life_areas WHERE name = ?"
    ).get(data.name.toLowerCase().trim()) as Record<string, unknown>;

    return this.parseLifeAreaRow(row);
  }

  updateLifeArea(id: number, data: {
    label?: string;
    description?: string;
    color?: string;
  }): LifeAreaConfig | null {
    const existing = this.db.prepare(
      "SELECT * FROM life_areas WHERE id = ?"
    ).get(id) as Record<string, unknown> | undefined;
    if (!existing) return null;

    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (data.label !== undefined) {
      updates.push("label = ?");
      params.push(data.label);
    }
    if (data.description !== undefined) {
      updates.push("description = ?");
      params.push(data.description);
    }
    if (data.color !== undefined) {
      updates.push("color = ?");
      params.push(data.color);
    }

    if (updates.length === 0) return this.parseLifeAreaRow(existing);

    params.push(id);
    this.db.prepare(
      `UPDATE life_areas SET ${updates.join(", ")} WHERE id = ?`
    ).run(...params);

    const row = this.db.prepare(
      "SELECT * FROM life_areas WHERE id = ?"
    ).get(id) as Record<string, unknown>;
    return this.parseLifeAreaRow(row);
  }

  archiveLifeArea(id: number): boolean {
    const count = this.db.prepare(
      "UPDATE life_areas SET active = 0 WHERE id = ?"
    ).run(id);
    return count > 0;
  }

  reorderLifeAreas(ids: number[]): void {
    const transaction = this.db.transaction(() => {
      const stmt = this.db.prepare(
        "UPDATE life_areas SET sort_order = ? WHERE id = ?"
      );
      for (let i = 0; i < ids.length; i++) {
        stmt.run(i, ids[i]);
      }
    });
    transaction();
  }

  seedDefaultLifeAreas(): void {
    const count = this.db.prepare(
      "SELECT count(*) as cnt FROM life_areas"
    ).get() as { cnt: number };

    if (count.cnt > 0) return;

    const defaults = [
      { name: "work", label: "Work", description: "Professional work, career, job-related", color: "#818cf8" },
      { name: "family", label: "Family", description: "Family relationships and responsibilities", color: "#ec4899" },
      { name: "health", label: "Health", description: "Physical health, mental health, energy, fitness", color: "#f59e0b" },
      { name: "finance", label: "Finance", description: "Money, budgeting, investments, financial planning", color: "#22c55e" },
      { name: "learning", label: "Learning", description: "Education, skills, personal development", color: "#60a5fa" },
      { name: "social", label: "Social", description: "Friends, networking, community", color: "#a855f7" },
      { name: "creative", label: "Creative", description: "Making things, hobbies, side projects", color: "#06b6d4" },
      { name: "home", label: "Home", description: "Living space, household management, chores", color: "#94a3b8" },
    ];

    for (let i = 0; i < defaults.length; i++) {
      this.db.prepare(
        "INSERT INTO life_areas (name, label, description, color, sort_order) VALUES (?, ?, ?, ?, ?)"
      ).run(defaults[i].name, defaults[i].label, defaults[i].description, defaults[i].color, i);
    }
  }

  private getNextLifeAreaSortOrder(): number {
    const row = this.db.prepare(
      "SELECT MAX(sort_order) as max_order FROM life_areas"
    ).get() as { max_order: number | null };
    return (row.max_order ?? -1) + 1;
  }

  private parseLifeAreaRow(row: Record<string, unknown>): LifeAreaConfig {
    return {
      id: row.id as number,
      name: row.name as string,
      label: row.label as string,
      description: (row.description as string) || null,
      color: row.color as string,
      sort_order: row.sort_order as number,
      active: (row.active as number) === 1,
      created_at: row.created_at as string,
    };
  }

  // ============================================
  // MANAGED TOPICS
  // ============================================

  getManagedTopics(activeOnly: boolean = true): ManagedTopic[] {
    const query = activeOnly
      ? "SELECT * FROM managed_topics WHERE active = 1 ORDER BY name"
      : "SELECT * FROM managed_topics ORDER BY name";
    const rows = this.db.prepare(query).all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.parseManagedTopicRow(row));
  }

  getManagedTopicNames(): string[] {
    const rows = this.db.prepare(
      "SELECT name FROM managed_topics WHERE active = 1 ORDER BY name"
    ).all() as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  addManagedTopic(name: string, lifeArea?: LifeArea): ManagedTopic {
    this.db.prepare(
      "INSERT INTO managed_topics (name, life_area) VALUES (?, ?)"
    ).run(name.toLowerCase().trim(), lifeArea || null);

    const row = this.db.prepare(
      "SELECT * FROM managed_topics WHERE name = ?"
    ).get(name.toLowerCase().trim()) as Record<string, unknown>;

    return this.parseManagedTopicRow(row);
  }

  deactivateManagedTopic(id: number): boolean {
    const count = this.db.prepare(
      "UPDATE managed_topics SET active = 0 WHERE id = ?"
    ).run(id);
    return count > 0;
  }

  private parseManagedTopicRow(row: Record<string, unknown>): ManagedTopic {
    return {
      id: row.id as number,
      name: row.name as string,
      life_area: (row.life_area as LifeArea) || null,
      created_at: row.created_at as string,
      active: (row.active as number) === 1,
    };
  }

  // ============================================
  // SUGGESTED TOPICS
  // ============================================

  suggestTopic(name: string, thoughtId?: string): SuggestedTopic | null {
    const normalized = name.toLowerCase().trim();

    // Skip if already a managed topic or pending suggestion
    const existing = this.db.prepare(
      "SELECT 1 FROM managed_topics WHERE name = ? AND active = 1 UNION SELECT 1 FROM suggested_topics WHERE name = ? AND status = 'pending'"
    ).get(normalized, normalized);
    if (existing) return null;

    this.db.prepare(
      "INSERT INTO suggested_topics (name, suggested_from_thought_id) VALUES (?, ?)"
    ).run(normalized, thoughtId || null);

    const row = this.db.prepare(
      "SELECT * FROM suggested_topics WHERE rowid = last_insert_rowid()"
    ).get() as Record<string, unknown>;

    return this.parseSuggestedTopicRow(row);
  }

  getPendingSuggestions(): SuggestedTopic[] {
    const rows = this.db.prepare(
      "SELECT * FROM suggested_topics WHERE status = 'pending' ORDER BY created_at DESC"
    ).all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.parseSuggestedTopicRow(row));
  }

  approveSuggestion(id: number, lifeArea?: LifeArea): ManagedTopic | null {
    const row = this.db.prepare(
      "SELECT * FROM suggested_topics WHERE id = ? AND status = 'pending'"
    ).get(id) as Record<string, unknown> | undefined;

    if (!row) return null;

    const name = (row.name as string).toLowerCase().trim();

    // Check if topic already exists
    const existing = this.db.prepare(
      "SELECT * FROM managed_topics WHERE name = ?"
    ).get(name) as Record<string, unknown> | undefined;

    if (existing) {
      // Just mark the suggestion as approved, reactivate if needed
      this.db.prepare("UPDATE suggested_topics SET status = 'approved' WHERE id = ?").run(id);
      this.db.prepare("UPDATE managed_topics SET active = 1 WHERE name = ?").run(name);
      return this.parseManagedTopicRow(
        this.db.prepare("SELECT * FROM managed_topics WHERE name = ?").get(name) as Record<string, unknown>
      );
    }

    const transaction = this.db.transaction(() => {
      this.db.prepare("UPDATE suggested_topics SET status = 'approved' WHERE id = ?").run(id);
      this.db.prepare(
        "INSERT INTO managed_topics (name, life_area) VALUES (?, ?)"
      ).run(name, lifeArea || null);
    });

    transaction();

    return this.parseManagedTopicRow(
      this.db.prepare("SELECT * FROM managed_topics WHERE name = ?").get(name) as Record<string, unknown>
    );
  }

  rejectSuggestion(id: number): boolean {
    const count = this.db.prepare(
      "UPDATE suggested_topics SET status = 'rejected' WHERE id = ? AND status = 'pending'"
    ).run(id);
    return count > 0;
  }

  rejectSuggestionsBatch(ids: number[]): void {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(",");
    this.db.prepare(
      `UPDATE suggested_topics SET status = 'rejected' WHERE id IN (${placeholders}) AND status = 'pending'`
    ).run(...ids);
  }

  // ============================================
  // GARDEN ACTIONS LOG
  // ============================================

  logGardenAction(runId: string, actionType: string, details: Record<string, unknown>, affectedIds: string[]): void {
    this.db.prepare(
      `INSERT INTO garden_actions (run_id, action_type, details, affected_ids) VALUES (?, ?, ?, ?)`
    ).run(runId, actionType, JSON.stringify(details), JSON.stringify(affectedIds));
  }

  getGardenLog(limit: number = 50): Array<{
    id: number; run_id: string; action_type: string;
    details: Record<string, unknown>; affected_ids: string[]; created_at: string;
  }> {
    const rows = this.db.prepare(
      "SELECT * FROM garden_actions ORDER BY created_at DESC LIMIT ?"
    ).all(limit) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: row.id as number, run_id: row.run_id as string,
      action_type: row.action_type as string,
      details: JSON.parse((row.details as string) || "{}"),
      affected_ids: JSON.parse((row.affected_ids as string) || "[]"),
      created_at: row.created_at as string,
    }));
  }

  getLastGardenRun(): { run_id: string; created_at: string } | null {
    const row = this.db.prepare(
      "SELECT run_id, MAX(created_at) as created_at FROM garden_actions GROUP BY run_id ORDER BY created_at DESC LIMIT 1"
    ).get() as { run_id: string; created_at: string } | undefined;
    if (!row || !row.run_id) return null;
    return { run_id: row.run_id, created_at: row.created_at };
  }

  private parseSuggestedTopicRow(row: Record<string, unknown>): SuggestedTopic {
    return {
      id: row.id as number,
      name: row.name as string,
      suggested_from_thought_id: (row.suggested_from_thought_id as string) || null,
      status: row.status as SuggestionStatus,
      created_at: row.created_at as string,
    };
  }

  // ============================================
  // BACKFILL: thoughts missing life area
  // ============================================

  getThoughtsMissingLifeArea(limit: number = 50): Thought[] {
    const rows = this.db.prepare(`
      SELECT * FROM thoughts
      WHERE auto_life_area IS NULL AND status = 'active'
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;

    return rows.map((row) => this.parseThoughtRow(row));
  }

  // ============================================
  // PREFERENCES (rules)
  // ============================================

  createPreference(data: {
    preference_name: string;
    domain?: string;
    reject: string;
    want: string;
    constraint_type?: ConstraintType;
  }): Preference {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO preferences (id, preference_name, domain, reject, want, constraint_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.preference_name,
      data.domain || "general",
      data.reject,
      data.want,
      data.constraint_type || "quality standard",
    );
    return this.getPreference(id)!;
  }

  getPreference(id: string): Preference | null {
    const row = this.db.prepare(
      "SELECT * FROM preferences WHERE id = ?"
    ).get(id) as Record<string, unknown> | undefined;
    return row ? this.parsePreferenceRow(row) : null;
  }

  listPreferences(domain?: string, constraintType?: ConstraintType): Preference[] {
    let query = "SELECT * FROM preferences WHERE 1=1";
    const params: string[] = [];

    if (domain) {
      query += " AND domain = ?";
      params.push(domain);
    }
    if (constraintType) {
      query += " AND constraint_type = ?";
      params.push(constraintType);
    }

    query += " ORDER BY domain, constraint_type, preference_name";

    const rows = this.db.prepare(query).all(...params) as Array<Record<string, unknown>>;
    return rows.map((row) => this.parsePreferenceRow(row));
  }

  updatePreference(id: string, data: {
    preference_name?: string;
    domain?: string;
    reject?: string;
    want?: string;
    constraint_type?: ConstraintType;
  }): Preference | null {
    const existing = this.getPreference(id);
    if (!existing) return null;

    const updates: string[] = [];
    const params: string[] = [];

    if (data.preference_name !== undefined) {
      updates.push("preference_name = ?");
      params.push(data.preference_name);
    }
    if (data.domain !== undefined) {
      updates.push("domain = ?");
      params.push(data.domain);
    }
    if (data.reject !== undefined) {
      updates.push("reject = ?");
      params.push(data.reject);
    }
    if (data.want !== undefined) {
      updates.push("want = ?");
      params.push(data.want);
    }
    if (data.constraint_type !== undefined) {
      updates.push("constraint_type = ?");
      params.push(data.constraint_type);
    }

    if (updates.length === 0) return existing;

    params.push(id);
    this.db.prepare(
      `UPDATE preferences SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(...params);

    return this.getPreference(id);
  }

  deletePreference(id: string): boolean {
    const count = this.db.prepare(
      "DELETE FROM preferences WHERE id = ?"
    ).run(id);
    return count > 0;
  }

  // ============================================
  // CONFIG ARTIFACTS (blocks)
  // ============================================

  createConfigArtifact(data: {
    name: string;
    domain?: string;
    content: string;
    artifact_type: ArtifactType;
    purpose?: string;
    constraint_type?: ConstraintType;
  }): ConfigArtifact {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO config_artifacts (id, name, domain, content, artifact_type, purpose, constraint_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.name,
      data.domain || "general",
      data.content,
      data.artifact_type,
      data.purpose || null,
      data.constraint_type || "domain rule",
    );
    return this.getConfigArtifact(id)!;
  }

  getConfigArtifact(id: string): ConfigArtifact | null {
    const row = this.db.prepare(
      "SELECT * FROM config_artifacts WHERE id = ?"
    ).get(id) as Record<string, unknown> | undefined;
    return row ? this.parseConfigArtifactRow(row) : null;
  }

  listConfigArtifacts(domain?: string, artifactType?: ArtifactType): ConfigArtifact[] {
    let query = "SELECT * FROM config_artifacts WHERE 1=1";
    const params: string[] = [];

    if (domain) {
      query += " AND domain = ?";
      params.push(domain);
    }
    if (artifactType) {
      query += " AND artifact_type = ?";
      params.push(artifactType);
    }

    query += " ORDER BY domain, artifact_type, name";

    const rows = this.db.prepare(query).all(...params) as Array<Record<string, unknown>>;
    return rows.map((row) => this.parseConfigArtifactRow(row));
  }

  updateConfigArtifact(id: string, data: {
    name?: string;
    domain?: string;
    content?: string;
    artifact_type?: ArtifactType;
    purpose?: string;
    constraint_type?: ConstraintType;
  }): ConfigArtifact | null {
    const existing = this.getConfigArtifact(id);
    if (!existing) return null;

    const updates: string[] = [];
    const params: string[] = [];

    if (data.name !== undefined) {
      updates.push("name = ?");
      params.push(data.name);
    }
    if (data.domain !== undefined) {
      updates.push("domain = ?");
      params.push(data.domain);
    }
    if (data.content !== undefined) {
      updates.push("content = ?");
      params.push(data.content);
    }
    if (data.artifact_type !== undefined) {
      updates.push("artifact_type = ?");
      params.push(data.artifact_type);
    }
    if (data.purpose !== undefined) {
      updates.push("purpose = ?");
      params.push(data.purpose);
    }
    if (data.constraint_type !== undefined) {
      updates.push("constraint_type = ?");
      params.push(data.constraint_type);
    }

    if (updates.length === 0) return existing;

    params.push(id);
    this.db.prepare(
      `UPDATE config_artifacts SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(...params);

    return this.getConfigArtifact(id);
  }

  deleteConfigArtifact(id: string): boolean {
    const count = this.db.prepare(
      "DELETE FROM config_artifacts WHERE id = ?"
    ).run(id);
    return count > 0;
  }

  upsertConfigArtifact(domain: string, artifactName: string, data: {
    content: string;
    artifact_type: ArtifactType;
    purpose?: string;
    constraint_type?: ConstraintType;
  }): ConfigArtifact {
    const existing = this.db.prepare(
      "SELECT * FROM config_artifacts WHERE domain = ? AND name = ?"
    ).get(domain, artifactName) as Record<string, unknown> | undefined;

    if (existing) {
      return this.updateConfigArtifact(existing.id as string, {
        content: data.content,
        artifact_type: data.artifact_type,
        purpose: data.purpose,
        constraint_type: data.constraint_type,
      })!;
    }

    return this.createConfigArtifact({
      name: artifactName,
      domain,
      content: data.content,
      artifact_type: data.artifact_type,
      purpose: data.purpose,
      constraint_type: data.constraint_type || "domain rule",
    });
  }

  listConfigProfiles(): Array<{ domain: string; total: number; by_type: Record<string, number> }> {
    const rows = this.db.prepare(
      "SELECT domain, artifact_type, COUNT(*) as count FROM config_artifacts GROUP BY domain, artifact_type ORDER BY domain"
    ).all() as Array<{ domain: string; artifact_type: string; count: number }>;

    const profiles: Record<string, { total: number; by_type: Record<string, number> }> = {};
    for (const row of rows) {
      if (!profiles[row.domain]) {
        profiles[row.domain] = { total: 0, by_type: {} };
      }
      profiles[row.domain].total += row.count;
      profiles[row.domain].by_type[row.artifact_type] = row.count;
    }

    return Object.entries(profiles).map(([domain, data]) => ({ domain, ...data }));
  }

  findByPurpose(purpose: string, domains?: string[]): ConfigArtifact[] {
    let query = "SELECT * FROM config_artifacts WHERE purpose = ?";
    const params: string[] = [purpose];

    if (domains && domains.length > 0) {
      const placeholders = domains.map(() => "?").join(", ");
      query += ` AND domain IN (${placeholders})`;
      params.push(...domains);
    }

    query += " ORDER BY domain, name";
    const rows = this.db.prepare(query).all(...params) as Array<Record<string, unknown>>;
    return rows.map((row) => this.parseConfigArtifactRow(row));
  }

  // ============================================
  // COMBINED PREFERENCES + ARTIFACTS
  // ============================================

  assemblePreferencesBlock(domain?: string): string {
    // Query preferences (rules)
    let prefQuery = "SELECT * FROM preferences";
    const prefParams: string[] = [];
    if (domain) {
      prefQuery += " WHERE domain = ?";
      prefParams.push(domain);
    }
    prefQuery += " ORDER BY domain, constraint_type, preference_name";
    const prefRows = this.db.prepare(prefQuery).all(...prefParams) as Array<Record<string, unknown>>;
    const prefs = prefRows.map((row) => this.parsePreferenceRow(row));

    // Query config artifacts (blocks)
    let artQuery = "SELECT * FROM config_artifacts";
    const artParams: string[] = [];
    if (domain) {
      artQuery += " WHERE domain = ?";
      artParams.push(domain);
    }
    artQuery += " ORDER BY domain, artifact_type, name";
    const artRows = this.db.prepare(artQuery).all(...artParams) as Array<Record<string, unknown>>;
    const artifacts = artRows.map((row) => this.parseConfigArtifactRow(row));

    const parts: string[] = [];

    for (const p of prefs) {
      parts.push(`**${p.preference_name}**\nReject: ${p.reject}\nWant: ${p.want}`);
    }

    for (const a of artifacts) {
      parts.push(`**${a.name}**\n${a.content}`);
    }

    return parts.join("\n\n");
  }

  listDomains(): Array<{ domain: string; count: number }> {
    return this.db.prepare(
      `SELECT domain, SUM(cnt) as count FROM (
        SELECT domain, COUNT(*) as cnt FROM preferences GROUP BY domain
        UNION ALL
        SELECT domain, COUNT(*) as cnt FROM config_artifacts GROUP BY domain
      ) GROUP BY domain ORDER BY domain`
    ).all() as Array<{ domain: string; count: number }>;
  }

  private parsePreferenceRow(row: Record<string, unknown>): Preference {
    return {
      id: row.id as string,
      preference_name: row.preference_name as string,
      domain: row.domain as string,
      reject: row.reject as string,
      want: row.want as string,
      constraint_type: row.constraint_type as ConstraintType,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  private parseConfigArtifactRow(row: Record<string, unknown>): ConfigArtifact {
    return {
      id: row.id as string,
      name: row.name as string,
      domain: row.domain as string,
      content: row.content as string,
      artifact_type: row.artifact_type as ArtifactType,
      purpose: (row.purpose as string) || null,
      constraint_type: row.constraint_type as ConstraintType,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  // ============================================
  // API KEYS
  // ============================================

  async createApiKey(data: { name: string; scopes: ApiKeyScope[] }): Promise<{ apiKey: ApiKey; rawKey: string }> {
    const id = crypto.randomUUID();
    const rawKey = "ob_" + crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "").slice(0, 16);
    const keyHash = await hashApiKey(rawKey);
    const keyPrefix = rawKey.slice(0, 11);
    const scopes = data.scopes.join(",");

    this.db.prepare(`
      INSERT INTO api_keys (id, name, key_hash, key_prefix, scopes)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, data.name, keyHash, keyPrefix, scopes);

    return { apiKey: this.getApiKey(id)!, rawKey };
  }

  getApiKeyByHash(keyHash: string): ApiKey | null {
    const row = this.db.prepare(
      "SELECT * FROM api_keys WHERE key_hash = ? AND enabled = 1"
    ).get(keyHash) as Record<string, unknown> | undefined;
    return row ? this.parseApiKeyRow(row) : null;
  }

  getApiKey(id: string): ApiKey | null {
    const row = this.db.prepare(
      "SELECT * FROM api_keys WHERE id = ?"
    ).get(id) as Record<string, unknown> | undefined;
    return row ? this.parseApiKeyRow(row) : null;
  }

  listApiKeys(): ApiKey[] {
    const rows = this.db.prepare(
      "SELECT * FROM api_keys ORDER BY created_at DESC"
    ).all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.parseApiKeyRow(row));
  }

  updateApiKey(id: string, data: { name?: string; scopes?: ApiKeyScope[]; enabled?: boolean }): ApiKey | null {
    const existing = this.getApiKey(id);
    if (!existing) return null;

    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (data.name !== undefined) {
      updates.push("name = ?");
      params.push(data.name);
    }
    if (data.scopes !== undefined) {
      updates.push("scopes = ?");
      params.push(data.scopes.join(","));
    }
    if (data.enabled !== undefined) {
      updates.push("enabled = ?");
      params.push(data.enabled ? 1 : 0);
    }

    if (updates.length === 0) return existing;

    params.push(id);
    this.db.prepare(
      `UPDATE api_keys SET ${updates.join(", ")} WHERE id = ?`
    ).run(...params);

    return this.getApiKey(id);
  }

  deleteApiKey(id: string): boolean {
    const count = this.db.prepare(
      "DELETE FROM api_keys WHERE id = ?"
    ).run(id);
    return count > 0;
  }

  touchApiKeyLastUsed(keyHash: string): void {
    this.db.prepare(
      "UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE key_hash = ?"
    ).run(keyHash);
  }

  private parseApiKeyRow(row: Record<string, unknown>): ApiKey {
    return {
      id: row.id as string,
      name: row.name as string,
      key_prefix: row.key_prefix as string,
      scopes: (row.scopes as string).split(",") as ApiKeyScope[],
      enabled: (row.enabled as number) === 1,
      last_used_at: (row.last_used_at as string) || null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
}

/** SHA-256 hash a raw API key to hex string */
export async function hashApiKey(rawKey: string): Promise<string> {
  const data = new TextEncoder().encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

let dbInstance: OpenBrainDatabaseManager | null = null;

export function getOpenBrainDatabase(dbPath?: string): OpenBrainDatabaseManager {
  if (!dbInstance) {
    dbInstance = new OpenBrainDatabaseManager(dbPath);
  }
  return dbInstance;
}

export function closeOpenBrainDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
