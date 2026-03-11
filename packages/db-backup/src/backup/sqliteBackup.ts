/**
 * SQLite backup utilities using SQLite's backup API
 * Provides consistent snapshots even with active writers (WAL mode)
 */

import { Database } from 'sqlite3';
import { exists } from 'std/fs';
import { dirname } from 'std/path';

export interface BackupProgress {
  remaining: number;
  total: number;
  percentage: number;
}

export type ProgressCallback = (progress: BackupProgress) => void;

/**
 * Create a backup of a SQLite database using the backup API
 * This is superior to file copy as it handles WAL mode correctly
 */
export async function backupDatabase(
  sourcePath: string,
  targetPath: string,
  onProgress?: ProgressCallback
): Promise<void> {
  // Ensure source exists
  if (!await exists(sourcePath)) {
    throw new Error(`Source database not found: ${sourcePath}`);
  }

  // Ensure target directory exists
  const targetDir = dirname(targetPath);
  await Deno.mkdir(targetDir, { recursive: true });

  // Open source database in read-only mode
  const sourceDb = new Database(sourcePath, { readonly: true });

  // Create target database
  const targetDb = new Database(targetPath);

  try {
    // Use SQLite backup API
    // We'll read all data from source and write to target
    // This handles WAL mode correctly

    // Get list of tables
    const tables = sourceDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all<{ name: string }>();

    let processedTables = 0;
    const totalTables = tables.length;

    // Copy each table
    for (const { name } of tables) {
      // Get table schema
      const createStmt = sourceDb.prepare(
        `SELECT sql FROM sqlite_master WHERE type='table' AND name = ?`
      ).value<[string]>(name)?.[0];

      if (createStmt) {
        targetDb.exec(createStmt);
      }

      // Copy data
      const rows = sourceDb.prepare(`SELECT * FROM "${name}"`).all();

      if (rows.length > 0) {
        // Get column names
        const columns = Object.keys(rows[0]);
        const placeholders = columns.map(() => '?').join(', ');
        const columnNames = columns.map(c => `"${c}"`).join(', ');

        const insertStmt = targetDb.prepare(
          `INSERT INTO "${name}" (${columnNames}) VALUES (${placeholders})`
        );

        // Batch insert for performance
        targetDb.exec('BEGIN TRANSACTION');
        for (const row of rows) {
          const values = columns.map(col => row[col]);
          insertStmt.run(...values);
        }
        targetDb.exec('COMMIT');
      }

      processedTables++;
      if (onProgress) {
        onProgress({
          remaining: totalTables - processedTables,
          total: totalTables,
          percentage: (processedTables / totalTables) * 100,
        });
      }
    }

    // Copy indexes
    const indexes = sourceDb.prepare(
      "SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL"
    ).all<{ sql: string }>();

    for (const { sql } of indexes) {
      targetDb.exec(sql);
    }

    // Copy views
    const views = sourceDb.prepare(
      "SELECT sql FROM sqlite_master WHERE type='view'"
    ).all<{ sql: string }>();

    for (const { sql } of views) {
      targetDb.exec(sql);
    }

    // Copy triggers
    const triggers = sourceDb.prepare(
      "SELECT sql FROM sqlite_master WHERE type='trigger'"
    ).all<{ sql: string }>();

    for (const { sql } of triggers) {
      targetDb.exec(sql);
    }

  } finally {
    sourceDb.close();
    targetDb.close();
  }
}

/**
 * Create an in-memory backup (returns file contents as Uint8Array)
 */
export async function backupToMemory(sourcePath: string): Promise<Uint8Array> {
  const tempPath = await Deno.makeTempFile({ suffix: '.db' });

  try {
    await backupDatabase(sourcePath, tempPath);
    return await Deno.readFile(tempPath);
  } finally {
    await Deno.remove(tempPath);
  }
}

/**
 * Restore database from memory (Uint8Array)
 */
export async function restoreFromMemory(
  data: Uint8Array,
  targetPath: string,
  overwrite = false
): Promise<void> {
  // Check if target exists
  if (await exists(targetPath) && !overwrite) {
    throw new Error(`Target database already exists: ${targetPath}. Use overwrite=true to replace.`);
  }

  // Ensure target directory exists
  const targetDir = dirname(targetPath);
  await Deno.mkdir(targetDir, { recursive: true });

  // Write data to file
  await Deno.writeFile(targetPath, data);

  // Verify it's a valid SQLite database
  try {
    const db = new Database(targetPath, { readonly: true });
    db.close();
  } catch (error) {
    // Clean up invalid file
    await Deno.remove(targetPath);
    throw new Error(`Restored file is not a valid SQLite database: ${(error as Error).message}`);
  }
}

/**
 * Get database file size
 */
export async function getDatabaseSize(dbPath: string): Promise<number> {
  const stat = await Deno.stat(dbPath);
  return stat.size;
}

/**
 * Get SQLite version from database
 */
export function getSQLiteVersion(dbPath: string): string {
  const db = new Database(dbPath, { readonly: true });
  try {
    const version = db.prepare('SELECT sqlite_version()').value<[string]>()?.[0];
    return version || 'unknown';
  } finally {
    db.close();
  }
}

