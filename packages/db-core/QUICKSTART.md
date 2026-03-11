# Quick Start Guide

Get started with `@p2b/db-core` in 5 minutes.

## Installation

### Step 1: Add Import Mapping

In your service's `deno.json`:

```json
{
  "imports": {
    "@p2b/db-core": "../packages/db-core/src/index.ts"
  }
}
```

## Basic Usage

### Create a Simple Database Manager

```typescript
import { BaseDatabaseManager } from "@p2b/db-core";

// Create database manager
const db = new BaseDatabaseManager("./my-database.db", {
  migrateDatabase: true,
  migrationsDir: "./migrations/sql"
});

// Create a table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Insert data
const insert = db.prepare("INSERT INTO users (id, name, email) VALUES (?, ?, ?)");
insert.run(['user-1', 'Alice', 'alice@example.com']);

// Query data
const select = db.prepare("SELECT * FROM users");
const users = select.all();
console.log(users);

// Close connection
db.close();
```

## Service Integration

### Extend for Your Service

```typescript
import { BaseDatabaseManager, DatabaseManagerOptions, findDbFile } from "@p2b/db-core";
import { join, dirname } from "std/path/mod.ts";

export class MyServiceDatabase extends BaseDatabaseManager {
  constructor(dbPath?: string, options: DatabaseManagerOptions = {}) {
    // Set your migrations directory
    const migrationsDir = join(
      dirname(new URL(import.meta.url).pathname),
      'migrations',
      'sql'
    );

    super(dbPath, {
      ...options,
      migrationsDir,
    });
  }

  // Override to customize database path resolution
  protected resolveDbPath(dbPath?: string): string {
    const envPath = Deno.env.get('MY_SERVICE_DB_PATH');
    const searchPath = dbPath || envPath || findDbFile("myservice.db");

    if (!searchPath) {
      throw new Error('Could not find database');
    }

    return searchPath;
  }

  // Add service-specific methods
  getUserCount(): number {
    const result = this.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
    return result.count;
  }
}

// Use it
const db = new MyServiceDatabase();
console.log('Users:', db.getUserCount());
db.close();
```

## Migrations

### Create a Migration

```typescript
await db.createMigration("add_users_table", `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
```

This creates a file like `001_add_users_table.sql` in your migrations directory.

### Check Migration Status

```typescript
const status = db.getMigrationStatus();
status.forEach(migration => {
  console.log(`${migration.id}: ${migration.filename}`, migration.applied_at ? '✓' : '✗');
});
```

### Run Migrations Manually

```typescript
await db.runMigrations();
```

Migrations run automatically on initialization if `migrateDatabase: true` is set.

## Advanced Features

### Load SQLite Extensions

```typescript
const db = new BaseDatabaseManager("./db.db", {
  extensions: [
    { path: "/path/to/vector0.so", envVar: "SQLITE_VECTOR_PATH" },
    { path: "/path/to/vss0.so", envVar: "SQLITE_VSS_PATH" }
  ]
});
```

### Create Environment-Dependent Tables

```typescript
const db = new BaseDatabaseManager("./db.db", {
  createEnvironmentTables: (db) => {
    const MODEL_DIM = Deno.env.get('EMBEDDING_DIM') || '384';
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vss_data USING vss0(embedding(${MODEL_DIM}));`);
  }
});
```

### Use Transactions

```typescript
const transaction = db.transaction(() => {
  db.prepare("INSERT INTO users (id, name) VALUES (?, ?)").run(['1', 'Alice']);
  db.prepare("INSERT INTO posts (id, user_id, title) VALUES (?, ?, ?)").run(['1', '1', 'Hello']);
});

transaction(); // Execute transaction
```

## Common Patterns

### Table Manager Classes

Organize your database code with table manager classes:

```typescript
class UserTable {
  constructor(private db: MyServiceDatabase) {}

  create(id: string, name: string, email: string) {
    const stmt = this.db.prepare("INSERT INTO users (id, name, email) VALUES (?, ?, ?)");
    stmt.run([id, name, email]);
  }

  findById(id: string) {
    const stmt = this.db.prepare("SELECT * FROM users WHERE id = ?");
    return stmt.get([id]);
  }

  findAll() {
    const stmt = this.db.prepare("SELECT * FROM users ORDER BY created_at DESC");
    return stmt.all();
  }
}

// In your DatabaseManager
export class MyServiceDatabase extends BaseDatabaseManager {
  public users!: UserTable;

  constructor(dbPath?: string, options?: DatabaseManagerOptions) {
    super(dbPath, options);
    this.users = new UserTable(this);
  }
}

// Use it
const db = new MyServiceDatabase();
db.users.create('user-1', 'Alice', 'alice@example.com');
const user = db.users.findById('user-1');
```

## Next Steps

- Read the [README.md](./README.md) for complete API documentation
- Check [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for migrating existing services
- Review [examples/](./examples/) for more usage patterns
- See [STRUCTURE.md](./STRUCTURE.md) for package organization

## Troubleshooting

### Database file not found

Use `findDbFile()` to search for the database:

```typescript
import { findDbFile } from "@p2b/db-core";

const dbPath = findDbFile("mydb.db");
if (!dbPath) {
  throw new Error("Database not found");
}
```

### Migrations not running

Ensure `migrationsDir` points to the correct directory:

```typescript
const migrationsDir = join(
  dirname(new URL(import.meta.url).pathname),
  'migrations',
  'sql'
);
```

### Import errors

Check that `deno.json` has the correct import mapping:

```json
{
  "imports": {
    "@p2b/db-core": "../packages/db-core/src/index.ts"
  }
}
```

## Support

- Check the [README.md](./README.md) for API reference
- Review [examples/](./examples/) for code samples
- See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for service integration
