// Database utility functions for schema migrations
import { Database } from "jsr:@db/sqlite@0.11";

/**
 * Check if a column exists in a table using PRAGMA table_info
 * @param db - Database instance
 * @param tableName - Name of the table to check
 * @param columnName - Name of the column to check for
 * @returns boolean - true if column exists, false otherwise
 */
function columnExists(db: Database, tableName: string, columnName: string): boolean {
  try {
    const stmt = db.prepare(`PRAGMA table_info(${tableName})`);
    const columns = stmt.all() as Array<{ name: string }>;
    return columns.some(col => col.name === columnName);
  } catch (_error) {
    return false;
  }
}

/**
 * Add a column to a table if it doesn't already exist.
 * Useful for TypeScript migrations that need idempotent schema changes.
 *
 * @param db - Database instance
 * @param table - Name of the table
 * @param column - Name of the column to add
 * @param type - SQLite column type (TEXT, INTEGER, REAL, BLOB, etc.)
 * @param options - Additional column options (DEFAULT, NOT NULL, etc.)
 *
 * @example
 * ```typescript
 * import { addColumnIfNotExists } from "@p2b/db-core";
 *
 * // Add a nullable text column
 * addColumnIfNotExists(db, "users", "nickname", "TEXT");
 *
 * // Add a column with default value
 * addColumnIfNotExists(db, "users", "is_active", "INTEGER", "DEFAULT 1");
 * ```
 */
export function addColumnIfNotExists(
  db: Database,
  table: string,
  column: string,
  type: string,
  options = ""
): void {
  if (!columnExists(db, table, column)) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type} ${options}`);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
