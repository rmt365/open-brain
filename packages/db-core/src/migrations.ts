// Migration utilities extracted from MigrationManager

import { Database } from "jsr:@db/sqlite@0.12";
import { join, dirname } from "jsr:@std/path@^1.0.8";
import { existsSync } from "jsr:@std/fs@^1.0.5";
import type { Migration, MigrationStatus } from "./types.ts";

export class MigrationManager {
  private db: Database;
  private migrationsDir: string;

  constructor(db: Database, migrationsDir?: string) {
    this.db = db;
    this.migrationsDir = migrationsDir || join(dirname(new URL(import.meta.url).pathname), 'sql');
    this.ensureMigrationTable();
  }

  private ensureMigrationTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        checksum TEXT
      );
    `);
  }

  private calculateChecksum(content: string): string {
    // Simple checksum - in production you might want to use crypto
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private getMigrationFiles(): string[] {
    try {
      const files: string[] = [];
      for (const entry of Deno.readDirSync(this.migrationsDir)) {
        if (
          entry.isFile && (entry.name.endsWith('.sql') || entry.name.endsWith('.ts'))
        ) {
          files.push(entry.name);
        }
      }
      // Sort by filename (assumes naming convention like 001_initial.sql, 002_add_columns.sql)
      return files.sort();
    } catch (error) {
      console.warn(`Migration directory not found: ${this.migrationsDir}`, error);
      return [];
    }
  }

  private getAppliedMigrations(): Set<string> {
    const stmt = this.db.prepare("SELECT id FROM schema_migrations");
    const rows = stmt.all() as Array<{ id: string }>;
    return new Set(rows.map(row => row.id));
  }

  private extractMigrationId(filename: string): string {
    // Extract ID from filename like "001_initial.sql" or "001_initial.ts" -> "001"
    const match = filename.match(/^(\d+)_/);
    if (match) return match[1];
    // fallback: remove known extensions
    return filename.replace(/\.(sql|ts)$/, '');
  }

  private ensureUpdatedAtTriggers(): void {
    // Get all tables
    const tablesStmt = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' and name not like '%versions' and name not like 'vss%';"
    );
    const tables = tablesStmt.all() as Array<{ name: string }>;
    tablesStmt.finalize();

    // console.log('[MigrationManager] Creating updated_at triggers for tables:', tables.map(t => t.name));

    for (const { name: tableName } of tables) {
      // Check if table has an updated_at column
      const columnStmt = this.db.prepare(`PRAGMA table_info(${tableName});`);
      // deno-lint-ignore no-explicit-any
      const columns = columnStmt.all() as any[];
      columnStmt.finalize();

      const hasUpdatedAt = columns.some(c => c.name === 'updated_at');
      if (!hasUpdatedAt) continue;

      // Trigger name
      const triggerName = `set_${tableName}_updated_at`;

      // Create trigger if it doesn't exist
      const sql = `
        CREATE TRIGGER IF NOT EXISTS ${triggerName}
        AFTER UPDATE ON ${tableName}
        FOR EACH ROW
        WHEN NEW.updated_at = OLD.updated_at
        BEGIN
          UPDATE ${tableName}
          SET updated_at = CURRENT_TIMESTAMP
          WHERE rowid = NEW.rowid;
        END;
      `;
      this.db.exec(sql);
    }
  }

  async runMigrations(): Promise<void> {
    console.log('[MigrationManager] Checking for pending migrations...');

    const migrationFiles = this.getMigrationFiles();
    const appliedMigrations = this.getAppliedMigrations();

    let appliedCount = 0;

    // console.log('[MigrationManager] Found migrations:', { migrationFiles, appliedMigrations });
    this.ensureUpdatedAtTriggers();

    for (const filename of migrationFiles) {
      const migrationId = this.extractMigrationId(filename);
      console.log('[MigrationManager] Processing:', { migrationId, filename });

      if (appliedMigrations.has(migrationId)) {
        console.log(`[MigrationManager] ✓ Migration ${migrationId} already applied`);
        continue;
      }

      await this.runSingleMigration(migrationId, filename);
      appliedCount++;
    }

    if (appliedCount > 0) {
      console.log(`[MigrationManager] ✅ Applied ${appliedCount} migrations`);
    } else {
      console.log('[MigrationManager] ✅ Database is up to date');
    }
  }

  private async runSingleMigration(migrationId: string, filename: string): Promise<void> {
    const filePath = join(this.migrationsDir, filename);
    if (!existsSync(filePath)) {
      throw new Error(`Migration file not found: ${filePath}`);
    }
    const ext = filename.split('.').pop();
    let checksum: string;

    console.log(`[MigrationManager] 🔄 Running migration ${migrationId}: ${filename}`);

    let trxCnt = 0;

    if (ext === 'sql') {
      // Handle .sql file
      const sql = await Deno.readTextFile(filePath);
      checksum = this.calculateChecksum(sql);

      // Run migration in transaction
      try {
        this.db.exec("BEGIN");
        trxCnt++;
        this.db.exec(sql);
        this.db.exec(`INSERT INTO schema_migrations (id, filename, checksum) VALUES ('${migrationId}', '${filename}', '${checksum}')`);
        this.db.exec("COMMIT");
        trxCnt--;
        console.log(`[MigrationManager] ✅ Applied migration ${migrationId}`);
      } catch (error) {
        console.error(`[MigrationManager] ❌ Migration ${migrationId} failed:`, error);
        // Try to rollback if transaction is active
        try {
          this.db.exec("ROLLBACK");
          trxCnt--;
        } catch (rollbackError) {
          console.warn('[MigrationManager] Could not rollback transaction:', rollbackError);
        }
        throw error;
      }
      console.log('[MigrationManager] Transaction count:', { trxCnt });
    } else if (ext === 'ts') {
      // Handle .ts migration
      const moduleUrl = `file://${filePath}`;
      const tsSource = await Deno.readTextFile(filePath);
      checksum = this.calculateChecksum(tsSource);

      const mod = await import(moduleUrl);
      if (typeof mod.default !== 'function') {
        throw new Error(`Migration module ${filename} does not export a default function`);
      }
      // Supports async or sync functions
      const status = mod.default(this.db);
      console.log('[MigrationManager] TypeScript migration status:', { status });

      // Record that migration was applied
      const sql = `INSERT INTO schema_migrations (id, filename, checksum) VALUES ('${migrationId}', '${filename}', '${checksum}')`;
      this.db.exec(sql);
      console.log(`[MigrationManager] ✅ Applied migration ${migrationId}`);
    } else {
      throw new Error(`Unsupported migration file type: ${filename}`);
    }
  }

  async createMigration(name: string, sql?: string): Promise<string> {
    // Get next migration number
    const existingFiles = this.getMigrationFiles();
    const lastNumber = existingFiles.length > 0
      ? Math.max(...existingFiles.map(f => parseInt(this.extractMigrationId(f)) || 0))
      : 0;

    const nextNumber = (lastNumber + 1).toString().padStart(3, '0');
    const filename = `${nextNumber}_${name.toLowerCase().replace(/\s+/g, '_')}.sql`;
    const filePath = join(this.migrationsDir, filename);

    // Ensure migrations directory exists
    try {
      await Deno.mkdir(this.migrationsDir, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        throw error;
      }
    }

    const template = sql || `-- Migration: ${name}
-- Created: ${new Date().toISOString()}

-- Add your SQL commands here
-- Example:
-- ALTER TABLE example_table ADD COLUMN new_column TEXT;

-- Remember to test your migration thoroughly!
`;

    await Deno.writeTextFile(filePath, template);
    console.log(`[MigrationManager] 📝 Created migration: ${filename}`);

    return filePath;
  }

  async rollbackLastMigration(): Promise<void> {
    console.warn('[MigrationManager] ⚠️  Rollback functionality should be implemented carefully');
    console.warn('[MigrationManager] ⚠️  Consider creating a new migration to undo changes instead');

    // Get the last applied migration
    const stmt = this.db.prepare(`
      SELECT id, filename FROM schema_migrations
      ORDER BY applied_at DESC
      LIMIT 1
    `);
    const lastMigration = stmt.get() as { id: string; filename: string } | undefined;
    stmt.finalize();

    if (!lastMigration) {
      console.log('[MigrationManager] No migrations to rollback');
      return;
    }

    // Look for rollback file
    const rollbackFilename = lastMigration.filename.replace('.sql', '_rollback.sql');
    const rollbackPath = join(this.migrationsDir, rollbackFilename);

    if (!existsSync(rollbackPath)) {
      throw new Error(`Rollback file not found: ${rollbackPath}. Create it manually or use a new migration to undo changes.`);
    }

    const rollbackSql = await Deno.readTextFile(rollbackPath);

    console.log(`[MigrationManager] 🔄 Rolling back migration ${lastMigration.id}`);

    const transaction = this.db.transaction(() => {
      // Execute rollback SQL
      this.db.exec(rollbackSql);

      // Remove migration record
      const deleteStmt = this.db.prepare("DELETE FROM schema_migrations WHERE id = ?");
      deleteStmt.run([lastMigration.id]);
    });

    transaction();
    console.log(`[MigrationManager] ✅ Rolled back migration ${lastMigration.id}`);
  }

  getMigrationStatus(): Array<MigrationStatus> {
    const files = this.getMigrationFiles();
    const appliedStmt = this.db.prepare("SELECT * FROM schema_migrations WHERE id = ?");

    const result = files.map(filename => {
      const migrationId = this.extractMigrationId(filename);
      const applied = appliedStmt.get([migrationId]) as { applied_at: string } | undefined;

      return {
        id: migrationId,
        filename,
        applied_at: applied ? new Date(applied.applied_at) : undefined
      };
    });

    appliedStmt.finalize();
    return result;
  }
}
