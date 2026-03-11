// Common database types shared across services

export interface Migration {
  id: string;
  filename: string;
  sql: string;
  applied_at?: Date;
}

export interface MigrationStatus {
  id: string;
  filename: string;
  applied_at?: Date;
}

export interface QueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
}

export interface DatabaseConfig {
  /**
   * Path to the SQLite database file
   */
  dbPath?: string;

  /**
   * Environment variable name for database path (fallback)
   */
  dbPathEnvVar?: string;

  /**
   * Default database filename to search for
   */
  defaultDbFilename?: string;

  /**
   * Whether to run migrations on initialization
   */
  runMigrations?: boolean;

  /**
   * Directory containing migration files (relative to calling code)
   */
  migrationsDir?: string;

  /**
   * SQLite extensions to load
   */
  extensions?: {
    path: string;
    envVar?: string;
  }[];

  /**
   * Environment-specific table creation callback
   */
  createEnvironmentTables?: (db: unknown) => void;
}

export interface DatabaseManagerOptions {
  /**
   * Database file path
   */
  dbPath?: string;

  /**
   * Whether to run migrations on initialization (default: true)
   */
  migrateDatabase?: boolean;

  /**
   * Directory containing migration SQL/TS files
   */
  migrationsDir?: string;

  /**
   * Function to create environment-dependent tables (e.g., virtual tables)
   */
  createEnvironmentTables?: (db: unknown) => void;

  /**
   * SQLite extensions to load
   */
  extensions?: Array<{
    path: string;
    envVar?: string;
  }>;

  /**
   * Whether to load extensions (default: same as migrateDatabase for backwards compat)
   * Set to true to load extensions even when migrateDatabase is false
   */
  loadExtensions?: boolean;
}

export interface DbSearchOptions {
  filename: string;
  startDir?: string;
  maxDepth?: number;
}
