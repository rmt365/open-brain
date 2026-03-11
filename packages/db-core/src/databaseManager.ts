// Base DatabaseManager class for shared database operations

import { existsSync } from "jsr:@std/fs@^1.0.5";
import { join, dirname, resolve } from "jsr:@std/path@^1.0.8";
import { Database } from "jsr:@db/sqlite@0.12";
import { MigrationManager } from "./migrations.ts";
import type { DatabaseManagerOptions } from "./types.ts";

/**
 * Finds a database file by searching up the directory tree
 * @param filename - Database filename to search for
 * @param startDir - Starting directory (defaults to current working directory)
 * @param maxDepth - Maximum depth to search up (default: 5)
 * @returns Absolute path to the database file, or null if not found
 */
export function findDbFile(
  filename: string,
  startDir = Deno.cwd(),
  maxDepth = 5
): string | null {
  let currentDir = resolve(startDir);
  console.log(`[DatabaseManager] Searching for ${filename} starting at ${currentDir}`);

  const candidateDirs = [
    ".", // current dir
    "database",
    "db",
    "sqlite_db",
    "sqlite_database",
    "data",
  ];

  // Regexp to match directory names suggestive of databases
  const dbDirPattern = /(db|database|sqlite|data)/i;

  for (let depth = 0; depth < maxDepth; depth++) {
    for (const dir of candidateDirs) {
      const candidateDir = dir === "." ? currentDir : join(currentDir, dir);
      const candidate = join(candidateDir, filename);
      console.log(`[DatabaseManager] Checking ${candidate}`);
      if (existsSync(candidate)) return candidate;
    }

    // Also search in any other subfolder in currentDir that matches dbDirPattern
    try {
      for (const entry of Deno.readDirSync(currentDir)) {
        if (entry.isDirectory && dbDirPattern.test(entry.name)) {
          const dirPath = join(currentDir, entry.name);
          const possible = join(dirPath, filename);
          console.log(`[DatabaseManager] Checking ${possible}`);
          if (existsSync(possible)) return possible;
        }
      }
    // deno-lint-ignore no-empty
    } catch (_err) {}

    currentDir = dirname(currentDir);
  }
  return null;
}

/**
 * Checks if a directory is writable by attempting to create a test file
 * @param dbPath - Path to the database file
 * @throws Error if directory is not writable
 */
export function checkDirectoryPermissions(dbPath: string): void {
  const dir = dbPath.substring(0, dbPath.lastIndexOf('/'));

  try {
    // Check if we can write to the directory
    const testFile = `${dir}/.test-write-${Date.now()}`;

    // Try to create a test file
    Deno.writeTextFileSync(testFile, 'test');

    // Clean up test file
    Deno.removeSync(testFile);

    console.log(`[DatabaseManager] ✅ Directory is writable: ${dir}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[DatabaseManager] ❌ Directory not writable: ${dir}`, error);
    throw new Error(`Database directory not writable: ${errorMessage}`);
  }
}

/**
 * Base DatabaseManager class that can be extended by services
 * Handles common database operations, migrations, and configuration
 */
export class BaseDatabaseManager {
  public db!: Database;
  public migrationManager!: MigrationManager;

  constructor(
    dbPath?: string,
    options: DatabaseManagerOptions = {}
  ) {
    const {
      migrateDatabase = true,
      migrationsDir,
      createEnvironmentTables,
      extensions = [],
      loadExtensions,
    } = options;

    // Resolve database path
    const resolvedDbPath = this.resolveDbPath(dbPath);
    console.log(`[DatabaseManager] Using database path: ${resolvedDbPath}`);

    let db: Database | undefined;
    try {
      // Optionally check directory permissions (commented out by default)
      // checkDirectoryPermissions(resolvedDbPath);

      db = new Database(resolvedDbPath);
      this.db = db;
      console.log('[DatabaseManager] Database connection established');

      // Initialize migration manager
      const migrationsDirPath = migrationsDir || join(
        dirname(new URL(import.meta.url).pathname),
        'migrations',
        'sql'
      );
      this.migrationManager = new MigrationManager(this.db, migrationsDirPath);

      // Configure database (pragmas, extensions)
      // loadExtensions defaults to migrateDatabase for backwards compat
      const shouldLoadExtensions = loadExtensions ?? migrateDatabase;
      this.configDB(shouldLoadExtensions, extensions);

      // Run migrations and environment-specific setup
      this.initializeDatabase(migrateDatabase, createEnvironmentTables);
    } catch (error) {
      if (db) {
        try {
          db.close();
        } catch (e) {
          console.error('[DatabaseManager] Error closing db after startup failure:', e);
        }
      }
      console.error(`[DatabaseManager] Failed to open database at path ${resolvedDbPath}:`, error);
      throw error;
    }
  }

  /**
   * Resolves the database path from various sources:
   * 1. Explicit dbPath parameter
   * 2. Environment variable (service-specific)
   * 3. Search for default filename
   *
   * Override this method in subclasses to customize path resolution
   */
  protected resolveDbPath(dbPath?: string): string {
    const explicitDbPath = dbPath;
    const searchDbPath = explicitDbPath || findDbFile("database.db");
    const resolvedDbPath = searchDbPath || "";

    if (!resolvedDbPath) {
      throw new Error('[DatabaseManager] Could not resolve database path');
    }

    return resolvedDbPath;
  }

  /**
   * Initializes the database by running migrations and creating environment tables
   */
  private async initializeDatabase(
    migrateDatabase: boolean = true,
    createEnvironmentTables?: (db: Database) => void
  ): Promise<void> {
    console.log(`[DatabaseManager] Running database migrations... ${migrateDatabase}`);

    if (!migrateDatabase) return;

    try {
      // Run all pending migrations
      await this.migrationManager.runMigrations();

      // Handle special cases that can't be in migrations (like environment-dependent tables)
      if (createEnvironmentTables) {
        createEnvironmentTables(this.db);
      }

      console.log("[DatabaseManager] Database initialization complete");
    } catch (error) {
      console.error("[DatabaseManager] Migration failed:", error);
      throw error;
    }
  }

  /**
   * Configures SQLite database with pragmas and extensions
   */
  private configDB(
    shouldLoadExtensions: boolean = true,
    extensions: Array<{ path: string; envVar?: string }> = []
  ): void {
    try {
      // Enable foreign keys
      this.db.exec("PRAGMA foreign_keys = ON;");

      // Load extensions if enabled
      if (shouldLoadExtensions && extensions.length > 0) {
        let loaded = false;

        for (const ext of extensions) {
          const extPath = ext.envVar ? Deno.env.get(ext.envVar) : ext.path;

          if (!extPath) {
            console.warn(`[DatabaseManager] Extension path not found for ${ext.envVar || ext.path}`);
            continue;
          }

          console.log(`[DatabaseManager] Loading extension: ${extPath}`);

          try {
            this.db.enableLoadExtension = true;
            this.db.loadExtension?.(extPath);
            loaded = true;
            console.log(`[DatabaseManager] Extension loaded: ${extPath}`);
          } catch (e) {
            console.log(`[DatabaseManager] Extension not found at: ${extPath} - ${e}`);
          }
        }

        if (!loaded && extensions.length > 0) {
          console.warn(
            "[DatabaseManager] No extensions were loaded: extensions may not be available"
          );
        }
      }

      // Set SQLite performance pragmas
      this.db.exec("PRAGMA journal_mode = WAL;");
      this.db.exec("PRAGMA synchronous = NORMAL;");

    } catch (e) {
      console.warn(`[DatabaseManager] Error setting pragmas: ${e}`);
    }
  }

  // Migration management methods
  async createMigration(name: string, sql?: string): Promise<string> {
    return await this.migrationManager.createMigration(name, sql);
  }

  async runMigrations(): Promise<void> {
    await this.migrationManager.runMigrations();
  }

  getMigrationStatus() {
    return this.migrationManager.getMigrationStatus();
  }

  async rollbackLastMigration(): Promise<void> {
    await this.migrationManager.rollbackLastMigration();
  }

  /**
   * Closes the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Execute raw SQL (use with caution)
   */
  exec(sql: string): void {
    this.db.exec(sql);
  }

  /**
   * Prepare a SQL statement
   */
  prepare(sql: string) {
    return this.db.prepare(sql);
  }

  /**
   * Run a transaction
   */
  transaction<T>(fn: () => T): () => T {
    return this.db.transaction(fn);
  }
}
