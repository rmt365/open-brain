# @p2b/db-core

Shared database management utilities for P2B services.

## Overview

This package provides a base `DatabaseManager` class and migration utilities that can be used across all TypeScript services in the P2B monorepo. It handles:

- SQLite database connections
- Migration management (SQL and TypeScript migrations)
- Database path resolution and discovery
- Extension loading (e.g., vector search)
- Common database configuration (pragmas, foreign keys, WAL mode)

## Usage

### Basic Usage

```typescript
import { BaseDatabaseManager } from "../packages/db-core/src/index.ts";

// Create a database manager instance
const dbManager = new BaseDatabaseManager("/path/to/database.db", {
  migrateDatabase: true,
  migrationsDir: "./migrations/sql",
});

// Access the database
const result = dbManager.prepare("SELECT * FROM users").all();

// Close when done
dbManager.close();
```

### Extending for Service-Specific Logic

```typescript
import { BaseDatabaseManager, DatabaseManagerOptions } from "../packages/db-core/src/index.ts";
import { Database } from "sqlite3";

export class MyServiceDatabase extends BaseDatabaseManager {
  // Add service-specific table managers
  public users!: UserTable;
  public posts!: PostTable;

  constructor(dbPath?: string, options: DatabaseManagerOptions = {}) {
    super(dbPath, options);

    // Initialize service-specific tables
    this.users = new UserTable(this);
    this.posts = new PostTable(this);
  }

  // Override path resolution for service-specific defaults
  protected resolveDbPath(dbPath?: string): string {
    const envPath = Deno.env.get('MY_SERVICE_DB_PATH');
    const searchPath = dbPath || envPath || findDbFile("myservice.db");

    if (!searchPath) {
      throw new Error('[MyServiceDatabase] Could not resolve database path');
    }

    return searchPath;
  }
}
```

### Environment-Specific Tables

```typescript
const dbManager = new BaseDatabaseManager("/path/to/db.db", {
  migrateDatabase: true,
  createEnvironmentTables: (db: Database) => {
    // Create virtual tables or environment-dependent structures
    const MODEL_DIM = Deno.env.get('EMBEDDING_DIM') || '384';
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vss_chunks USING vss0(embedding(${MODEL_DIM}));`);
  },
});
```

### Loading SQLite Extensions

```typescript
const dbManager = new BaseDatabaseManager("/path/to/db.db", {
  migrateDatabase: true,
  extensions: [
    {
      path: "/path/to/vector0.so",
      envVar: "SQLITE_VECTOR_PATH"
    },
    {
      path: "/path/to/vss0.so",
      envVar: "SQLITE_VSS_PATH"
    },
  ],
});
```

## Migration Management

### Creating Migrations

```typescript
// Create a new migration file
await dbManager.createMigration("add_users_table", `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
```

### Running Migrations

Migrations are automatically run on initialization if `migrateDatabase: true` is set. You can also run them manually:

```typescript
await dbManager.runMigrations();
```

### Migration Status

```typescript
const status = dbManager.getMigrationStatus();
console.log(status);
// [
//   { id: '001', filename: '001_initial.sql', applied_at: Date },
//   { id: '002', filename: '002_add_users.sql', applied_at: undefined }
// ]
```

### TypeScript Migrations

TypeScript migrations export a default function that receives the database instance:

```typescript
// migrations/sql/003_custom_logic.ts
import { Database } from "sqlite3";

export default function(db: Database) {
  // Custom migration logic
  db.exec("CREATE TABLE custom (...);");

  // Can include complex logic, data transformations, etc.
  const users = db.prepare("SELECT * FROM users").all();
  // ... process users
}
```

## API Reference

### BaseDatabaseManager

#### Constructor

```typescript
constructor(dbPath?: string, options?: DatabaseManagerOptions)
```

**Options:**
- `migrateDatabase` (boolean): Run migrations on init (default: true)
- `migrationsDir` (string): Path to migrations directory
- `createEnvironmentTables` (function): Callback to create environment-specific tables
- `extensions` (array): SQLite extensions to load

#### Methods

- `createMigration(name: string, sql?: string): Promise<string>` - Create a new migration file
- `runMigrations(): Promise<void>` - Run pending migrations
- `getMigrationStatus()` - Get migration status
- `rollbackLastMigration(): Promise<void>` - Rollback last migration (requires rollback file)
- `close(): void` - Close database connection
- `exec(sql: string): void` - Execute raw SQL
- `prepare(sql: string)` - Prepare a statement
- `transaction<T>(fn: () => T): () => T` - Run a transaction

### Utilities

- `findDbFile(filename: string, startDir?: string, maxDepth?: number): string | null` - Search for database file up the directory tree
- `checkDirectoryPermissions(dbPath: string): void` - Verify directory is writable

## Migration Naming Convention

Migrations should follow the pattern: `<number>_<description>.<ext>`

Examples:
- `001_initial_schema.sql`
- `002_add_users_table.sql`
- `003_custom_migration.ts`

The number prefix determines execution order.

## Features

### Automatic Triggers

The migration manager automatically creates `updated_at` triggers for any table that has an `updated_at` column. These triggers update the timestamp whenever a row is modified.

### Database Path Discovery

The `findDbFile()` utility searches for database files in common locations:
- Current directory
- `./database/`
- `./db/`
- `./sqlite_db/`
- `./sqlite_database/`
- `./data/`
- Any directory matching `/db|database|sqlite|data/i`

It searches up to 5 levels up the directory tree by default.

### WAL Mode

All databases are configured with:
- `PRAGMA journal_mode = WAL;` - Write-Ahead Logging for better concurrency
- `PRAGMA synchronous = NORMAL;` - Balance between safety and performance
- `PRAGMA foreign_keys = ON;` - Enforce foreign key constraints

## Integration with Services

To use this package in a service:

1. Import from the package:
```typescript
import { BaseDatabaseManager } from "../packages/db-core/src/index.ts";
```

2. Extend the base class for service-specific needs
3. Place migration files in your service's migrations directory
4. Initialize with service-specific configuration

## Example: Podcraft Service Integration

```typescript
// podcraft/src/p2b/src/server/db/databaseManager.ts
import { BaseDatabaseManager, DatabaseManagerOptions } from "../../../../../packages/db-core/src/index.ts";
import { FeedTable } from './feeds.ts';
import { EpisodeTable } from './episodes.ts';

export class DatabaseManager extends BaseDatabaseManager {
  public feeds!: FeedTable;
  public episodes!: EpisodeTable;

  constructor(dbPath?: string, options: DatabaseManagerOptions = {}) {
    // Set default migrations directory
    const migrationsDir = join(
      dirname(new URL(import.meta.url).pathname),
      'migrations',
      'sql'
    );

    // Configure extensions
    const extensions = [
      { envVar: 'SQLITE_VECTOR_PATH' },
      { envVar: 'SQLITE_VSS_PATH' },
    ].filter(ext => Deno.env.get(ext.envVar!))
     .map(ext => ({ path: Deno.env.get(ext.envVar!)! }));

    super(dbPath, {
      ...options,
      migrationsDir,
      extensions,
      createEnvironmentTables: (db) => {
        // Vector search table
        const MODEL_DIM = Deno.env.get('EMBEDDING_DIM') || '384';
        db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vss_chunks USING vss0(embedding(${MODEL_DIM}));`);
      },
    });

    // Initialize service-specific tables
    this.feeds = new FeedTable(this);
    this.episodes = new EpisodeTable(this);
  }

  protected resolveDbPath(dbPath?: string): string {
    const envPath = Deno.env.get('PODCRAFT_DB_PATH');
    const searchPath = dbPath || envPath || findDbFile("podcast_books.db");

    if (!searchPath) {
      throw new Error('[DatabaseManager] Could not resolve database path');
    }

    return searchPath;
  }
}
```

## License

MIT
