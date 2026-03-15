import { BaseDatabaseManager } from "@p2b/db-core";
import { join, dirname, fromFileUrl } from "@std/path";
import type {
  Thought,
  ThoughtType,
  SourceChannel,
  ThoughtStatus,
  Sentiment,
  LifeArea,
  ConstraintType,
  BrainStats,
  CaptureThoughtRequest,
  UpdateThoughtRequest,
  ListThoughtsRequest,
  TastePreference,
  ManagedTopic,
  SuggestedTopic,
  SuggestionStatus,
} from "../types/index.ts";
import type { ClassificationResult } from "../logic/classifier.ts";

const VSS_EXTENSIONS = [
  { path: "/usr/local/lib/sqlite3/extensions/vector0", envVar: "SQLITE_VECTOR_PATH" },
  { path: "/usr/local/lib/sqlite3/extensions/vss0", envVar: "SQLITE_VSS_PATH" },
];

export class OpenBrainDatabaseManager extends BaseDatabaseManager {
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
      migrateDatabase: true,
      loadExtensions: true,
      migrationsDir,
      extensions: VSS_EXTENSIONS,
    });

    // Create VSS virtual table and rebuild index from existing embeddings
    const vssReady = this.createVSSTable();
    if (vssReady) {
      const { indexed } = this.rebuildVSSIndex();
      console.log(`[OpenBrainDB] VSS ready — ${indexed} embeddings indexed`);
    } else {
      console.log("[OpenBrainDB] VSS not available — search will use text fallback");
    }
  }

  // ============================================
  // VSS (Vector Similarity Search)
  // ============================================

  /** Create the VSS virtual table. Safe to call multiple times (IF NOT EXISTS). */
  createVSSTable(): boolean {
    try {
      this.db.exec(
        `CREATE VIRTUAL TABLE IF NOT EXISTS vss_thoughts USING vss0(embedding(1024))`
      );
      console.log("[OpenBrainDB] VSS table vss_thoughts ready");
      return true;
    } catch (e) {
      console.warn(`[OpenBrainDB] Could not create VSS table (extensions may not be loaded): ${e}`);
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
        id, text, thought_type, topic, life_area, source_channel, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.text,
      data.thought_type || "note",
      data.topic || null,
      data.life_area || null,
      data.source_channel || "api",
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

    if (filters.life_area) {
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

  /** Soft-delete (sets status to 'deleted'). */
  deleteThought(id: string): boolean {
    const count = this.db.prepare(
      "UPDATE thoughts SET status = 'deleted' WHERE id = ? AND status != 'deleted'"
    ).run(id);
    return count > 0;
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
    return count > 0;
  }

  /** Store an embedding and sync to VSS index. */
  storeEmbedding(
    id: string,
    embedding: Float32Array,
    model: string = "mxbai-embed-large"
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
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
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

  suggestTopic(name: string, thoughtId?: string): SuggestedTopic {
    this.db.prepare(
      "INSERT INTO suggested_topics (name, suggested_from_thought_id) VALUES (?, ?)"
    ).run(name.toLowerCase().trim(), thoughtId || null);

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
  // TASTE PREFERENCES
  // ============================================

  createPreference(data: {
    preference_name: string;
    domain?: string;
    reject: string;
    want: string;
    constraint_type?: ConstraintType;
  }): TastePreference {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO taste_preferences (id, preference_name, domain, reject, want, constraint_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.preference_name,
      data.domain || "general",
      data.reject,
      data.want,
      data.constraint_type || "quality standard"
    );
    return this.getPreference(id)!;
  }

  getPreference(id: string): TastePreference | null {
    const row = this.db.prepare(
      "SELECT * FROM taste_preferences WHERE id = ?"
    ).get(id) as Record<string, unknown> | undefined;
    return row ? this.parsePreferenceRow(row) : null;
  }

  listPreferences(domain?: string, constraintType?: ConstraintType): TastePreference[] {
    let query = "SELECT * FROM taste_preferences WHERE 1=1";
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
  }): TastePreference | null {
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
      `UPDATE taste_preferences SET ${updates.join(", ")} WHERE id = ?`
    ).run(...params);

    return this.getPreference(id);
  }

  deletePreference(id: string): boolean {
    const count = this.db.prepare(
      "DELETE FROM taste_preferences WHERE id = ?"
    ).run(id);
    return count > 0;
  }

  assemblePreferencesBlock(domain?: string): string {
    let query = "SELECT * FROM taste_preferences";
    const params: string[] = [];

    if (domain) {
      query += " WHERE domain = ?";
      params.push(domain);
    }

    query += " ORDER BY domain, constraint_type, preference_name";

    const rows = this.db.prepare(query).all(...params) as Array<Record<string, unknown>>;
    const prefs = rows.map((row) => this.parsePreferenceRow(row));

    if (prefs.length === 0) return "";

    return prefs.map((p) =>
      `**${p.preference_name}**\nReject: ${p.reject}\nWant: ${p.want}`
    ).join("\n\n");
  }

  private parsePreferenceRow(row: Record<string, unknown>): TastePreference {
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
