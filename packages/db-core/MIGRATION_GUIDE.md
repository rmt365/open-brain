# Migration Guide: Using @p2b/db-core in Services

This guide explains how to migrate existing services to use the shared `@p2b/db-core` package.

## Overview

The `@p2b/db-core` package provides shared database management utilities that eliminate code duplication across services. It extracts common patterns from the Podcraft service's `DatabaseManager` and makes them available to all services.

## Benefits

1. **Code Reuse**: Common database logic in one place
2. **Consistency**: All services use the same migration and connection patterns
3. **Maintainability**: Bug fixes and improvements apply to all services
4. **Extensibility**: Easy to extend for service-specific needs
5. **Type Safety**: Shared TypeScript types across services

## Migration Steps

### Step 1: Import the Package

In your service's `deno.json`, add an import mapping:

```json
{
  "imports": {
    "@p2b/db-core": "../packages/db-core/src/index.ts"
  }
}
```

### Step 2: Update Your DatabaseManager

Replace your existing `DatabaseManager` class with one that extends `BaseDatabaseManager`.

**Before:**

```typescript
// podcraft/src/p2b/src/server/db/databaseManager.ts
import { Database } from "sqlite3";
import { MigrationManager } from './migrations/migrationManager.ts';

export class DatabaseManager {
  public db!: Database;
  public migrationManager!: MigrationManager;
  public feeds!: FeedTable;
  // ... lots of boilerplate code
}
```

**After:**

```typescript
// podcraft/src/p2b/src/server/db/databaseManager.ts
import { BaseDatabaseManager, DatabaseManagerOptions, findDbFile } from "@p2b/db-core";
import { join, dirname } from "std/path/mod.ts";
import { Database } from "sqlite3";
import { FeedTable } from './feeds.ts';

export class DatabaseManager extends BaseDatabaseManager {
  // Service-specific table managers
  public feeds!: FeedTable;
  public episodes!: EpisodeTable;
  public chunks!: ChunkTable;

  constructor(dbPath?: string, options: DatabaseManagerOptions = {}) {
    // Set migrations directory relative to this file
    const migrationsDir = join(
      dirname(new URL(import.meta.url).pathname),
      'migrations',
      'sql'
    );

    // Configure SQLite extensions
    const extensions = [
      { envVar: 'SQLITE_VECTOR_PATH' },
      { envVar: 'SQLITE_VSS_PATH' },
    ].filter(ext => Deno.env.get(ext.envVar!))
     .map(ext => ({ path: Deno.env.get(ext.envVar!)! }));

    // Call parent constructor with configuration
    super(dbPath, {
      ...options,
      migrationsDir,
      extensions,
      createEnvironmentTables: (db: Database) => {
        // Create vector search virtual table
        const MODEL_DIM = Deno.env.get('EMBEDDING_DIM') || '384';
        const embeddingTable = `CREATE VIRTUAL TABLE IF NOT EXISTS vss_chunks USING vss0(embedding(${MODEL_DIM}));`;
        try {
          db.exec(embeddingTable);
          console.log('[DatabaseManager] Vector search virtual table ensured');
        } catch (error) {
          console.log('[DatabaseManager] Vector search table creation note:', error);
        }
      },
    });

    // Initialize service-specific table managers
    this.feeds = new FeedTable(this);
    this.episodes = new EpisodeTable(this);
    this.chunks = new ChunkTable(this);
  }

  // Override path resolution for service-specific defaults
  protected resolveDbPath(dbPath?: string): string {
    const explicitDbPath = dbPath || Deno.env.get('PODCRAFT_DB_PATH');
    const searchDbPath = explicitDbPath || findDbFile("podcast_books.db");
    const resolvedDbPath = searchDbPath || "";

    if (!resolvedDbPath) {
      throw new Error('[DatabaseManager] Could not resolve database path');
    }

    return resolvedDbPath;
  }

  // Service-specific methods (keep these)
  saveTheme(theme: Theme): void {
    // ... existing implementation
  }

  getThemes(feedId: string): Theme[] {
    // ... existing implementation
  }

  // ... other service-specific methods
}
```

### Step 3: Remove Duplicate Code

Delete the following from your service's database code (now handled by base class):

1. `findDbFile()` function - use the one from `@p2b/db-core`
2. `checkDirectoryPermissions()` function - available from `@p2b/db-core`
3. `configDB()` method - handled by base class
4. `initializeDatabase()` method - handled by base class
5. Basic migration methods - inherited from base class

### Step 4: Update Imports

Change your imports from local files to the shared package:

```typescript
// Before
import { MigrationManager } from './migrations/migrationManager.ts';

// After
import { MigrationManager } from "@p2b/db-core";
```

### Step 5: Update Migration Manager References

If you're importing `MigrationManager` directly, update to use the shared version:

```typescript
// Before
import { MigrationManager } from './migrations/migrationManager.ts';

// After
import { MigrationManager } from "@p2b/db-core";
```

### Step 6: Move Migration Files

Keep your migration SQL/TS files where they are. The base class accepts a `migrationsDir` parameter, so you can point it to your service's migration directory.

### Step 7: Test Thoroughly

1. Run your service's existing tests
2. Verify migrations run correctly
3. Check that all database operations work
4. Confirm extensions load properly

## New Service Setup

For a brand new service, follow this pattern:

```typescript
import { BaseDatabaseManager, DatabaseManagerOptions } from "@p2b/db-core";
import { join, dirname } from "std/path/mod.ts";

export class MyServiceDatabase extends BaseDatabaseManager {
  // Service-specific table managers
  public users!: UserTable;

  constructor(dbPath?: string, options: DatabaseManagerOptions = {}) {
    const migrationsDir = join(
      dirname(new URL(import.meta.url).pathname),
      'migrations',
      'sql'
    );

    super(dbPath, {
      ...options,
      migrationsDir,
    });

    // Initialize tables
    this.users = new UserTable(this);
  }

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

## Common Patterns

### Pattern 1: Service-Specific Environment Tables

```typescript
super(dbPath, {
  ...options,
  createEnvironmentTables: (db: Database) => {
    // Example: Vector search table
    const MODEL_DIM = Deno.env.get('EMBEDDING_DIM') || '384';
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vss_data USING vss0(embedding(${MODEL_DIM}));`);
  },
});
```

### Pattern 2: Loading SQLite Extensions

```typescript
const extensions = [
  { path: '/path/to/vector0.so', envVar: 'SQLITE_VECTOR_PATH' },
  { path: '/path/to/vss0.so', envVar: 'SQLITE_VSS_PATH' },
];

super(dbPath, {
  ...options,
  extensions,
});
```

### Pattern 3: Custom Database Path Resolution

```typescript
protected resolveDbPath(dbPath?: string): string {
  // Try these in order:
  // 1. Explicit parameter
  // 2. Service-specific env var
  // 3. Search for default filename
  // 4. Fallback to hardcoded path

  const envPath = Deno.env.get('SERVICE_DB_PATH');
  const searchPath = dbPath || envPath || findDbFile("service.db");
  const fallbackPath = searchPath || '/default/path/service.db';

  return fallbackPath;
}
```

### Pattern 4: Service-Specific Helper Methods

Keep these in your extended class:

```typescript
export class DatabaseManager extends BaseDatabaseManager {
  // ... constructor and table managers

  // Service-specific business logic
  getUserStats() {
    const stmt = this.prepare('SELECT COUNT(*) as count FROM users');
    return stmt.get() as { count: number };
  }

  cleanupOldRecords(days: number) {
    const stmt = this.prepare(`
      DELETE FROM records
      WHERE created_at < datetime('now', '-${days} days')
    `);
    stmt.run();
  }
}
```

## API Compatibility

The base class provides all methods from the original DatabaseManager:

- `createMigration(name, sql?)` - Create new migration
- `runMigrations()` - Run pending migrations
- `getMigrationStatus()` - Get migration status
- `rollbackLastMigration()` - Rollback last migration
- `close()` - Close database connection
- `exec(sql)` - Execute raw SQL
- `prepare(sql)` - Prepare statement
- `transaction(fn)` - Run transaction

## Troubleshooting

### Issue: Module not found

**Problem:** Import error for `@p2b/db-core`

**Solution:** Ensure `deno.json` has the correct import mapping:
```json
{
  "imports": {
    "@p2b/db-core": "../packages/db-core/src/index.ts"
  }
}
```

### Issue: Migrations not running

**Problem:** Migrations directory not found

**Solution:** Verify the `migrationsDir` parameter points to the correct location relative to your DatabaseManager file.

### Issue: Extensions not loading

**Problem:** SQLite extensions fail to load

**Solution:** Check that environment variables are set correctly and extension files exist at the specified paths.

### Issue: Path resolution fails

**Problem:** Database file not found

**Solution:** Override `resolveDbPath()` to implement service-specific path resolution logic.

## Examples

See the `examples/` directory in the `@p2b/db-core` package for:

- `basic-usage.ts` - Simple database operations
- `extended-usage.ts` - Full service implementation

## Support

For questions or issues with the shared database module:

1. Check the README.md for API documentation
2. Review the examples in the `examples/` directory
3. Look at the Podcraft service implementation as a reference
4. Check the CHANGELOG.md for recent changes

## Version Compatibility

- **v1.0.0**: Initial release, compatible with all Deno-based services
- Requires Deno 1.40+ and `@db/sqlite` 0.11+
