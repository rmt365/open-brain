// Example: Basic usage of @p2b/db-core

import { BaseDatabaseManager } from "../src/index.ts";

// Create a simple database manager
const dbManager = new BaseDatabaseManager("./example.db", {
  migrateDatabase: true,
  migrationsDir: "./migrations/sql",
});

// Create a simple table
dbManager.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Insert some data
const insertStmt = dbManager.prepare(`
  INSERT INTO users (id, name, email)
  VALUES (?, ?, ?)
`);

insertStmt.run(['user-1', 'Alice', 'alice@example.com']);
insertStmt.run(['user-2', 'Bob', 'bob@example.com']);

// Query data
const selectStmt = dbManager.prepare('SELECT * FROM users');
const users = selectStmt.all();

console.log('Users:', users);

// Clean up
dbManager.close();
