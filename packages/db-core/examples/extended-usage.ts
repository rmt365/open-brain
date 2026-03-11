// Example: Extending BaseDatabaseManager for a service

import { BaseDatabaseManager, DatabaseManagerOptions, findDbFile } from "../src/index.ts";
import { Database } from "sqlite3";
import { join, dirname } from "std/path/mod.ts";

// Define service-specific table classes
class UserTable {
  private dbManager: MyServiceDatabase;

  constructor(dbManager: MyServiceDatabase) {
    this.dbManager = dbManager;
  }

  create(id: string, name: string, email: string): void {
    const stmt = this.dbManager.prepare(`
      INSERT INTO users (id, name, email)
      VALUES (?, ?, ?)
    `);
    stmt.run([id, name, email]);
  }

  findById(id: string) {
    const stmt = this.dbManager.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get([id]);
  }

  findAll() {
    const stmt = this.dbManager.prepare('SELECT * FROM users ORDER BY created_at DESC');
    return stmt.all();
  }
}

// Extend BaseDatabaseManager for service-specific functionality
export class MyServiceDatabase extends BaseDatabaseManager {
  public users!: UserTable;

  constructor(dbPath?: string, options: DatabaseManagerOptions = {}) {
    // Set default migrations directory relative to this file
    const migrationsDir = options.migrationsDir || join(
      dirname(new URL(import.meta.url).pathname),
      '../migrations/sql'
    );

    // Configure extensions if needed
    const extensions = [
      { envVar: 'SQLITE_VECTOR_PATH' },
    ].filter(ext => Deno.env.get(ext.envVar!))
     .map(ext => ({ path: Deno.env.get(ext.envVar!)! }));

    super(dbPath, {
      ...options,
      migrationsDir,
      extensions,
      createEnvironmentTables: (db: Database) => {
        // Example: Create a virtual table if extension is loaded
        try {
          const MODEL_DIM = Deno.env.get('EMBEDDING_DIM') || '384';
          db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vss_embeddings USING vss0(embedding(${MODEL_DIM}));`);
          console.log('[MyServiceDatabase] Created vector search table');
        } catch (e) {
          console.log('[MyServiceDatabase] Vector search not available:', e);
        }
      },
    });

    // Initialize service-specific table managers
    this.users = new UserTable(this);

    console.log('[MyServiceDatabase] Service database initialized');
  }

  protected resolveDbPath(dbPath?: string): string {
    // Check service-specific environment variable
    const envPath = Deno.env.get('MY_SERVICE_DB_PATH');

    // Search for default database filename
    const searchPath = dbPath || envPath || findDbFile("myservice.db");

    if (!searchPath) {
      throw new Error('[MyServiceDatabase] Could not resolve database path');
    }

    return searchPath;
  }

  // Service-specific helper methods
  getUserStats() {
    const stmt = this.prepare('SELECT COUNT(*) as count FROM users');
    return stmt.get() as { count: number };
  }
}

// Usage example
if (import.meta.main) {
  const db = new MyServiceDatabase("./myservice.db", {
    migrateDatabase: true,
  });

  // Create table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Use service-specific methods
  db.users.create('user-1', 'Alice Johnson', 'alice@example.com');
  db.users.create('user-2', 'Bob Smith', 'bob@example.com');

  const allUsers = db.users.findAll();
  console.log('All users:', allUsers);

  const stats = db.getUserStats();
  console.log('User count:', stats.count);

  db.close();
}
