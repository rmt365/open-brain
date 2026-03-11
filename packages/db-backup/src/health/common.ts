/**
 * Common utilities for database health operations
 * Centralizes repeated patterns like connection management and PRAGMA queries
 */

import { Database } from 'sqlite3';

/**
 * Execute a function with a managed database connection
 * Automatically opens and closes the connection
 */
export function withDatabase<T>(dbPath: string, fn: (db: Database) => T): T {
  const db = new Database(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/**
 * Execute an async function with a managed database connection
 */
export async function withDatabaseAsync<T>(
  dbPath: string,
  fn: (db: Database) => Promise<T>
): Promise<T> {
  const db = new Database(dbPath);
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

export type CheckpointMode = 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE';

/**
 * Checkpoint WAL file for consistent database state
 *
 * Modes:
 * - PASSIVE: Non-blocking, checkpoints what it can
 * - FULL: Blocks until complete
 * - RESTART: Like FULL but restarts if blocked
 * - TRUNCATE: Like RESTART but also truncates WAL file
 *
 * @returns true if checkpoint succeeded, false otherwise
 */
export function checkpointWAL(dbPath: string, mode: CheckpointMode = 'PASSIVE'): boolean {
  try {
    return withDatabase(dbPath, (db) => {
      db.exec(`PRAGMA wal_checkpoint(${mode})`);
      return true;
    });
  } catch (error) {
    // Log the actual error instead of silent failure
    console.error(`[health] WAL checkpoint (${mode}) failed for ${dbPath}:`, error);
    return false;
  }
}

/**
 * Get database page statistics
 * Used by vacuum and health check modules
 */
export interface DatabasePageStats {
  pageCount: number;
  freeListCount: number;
  pageSize: number;
  totalSize: number;
  freeSpace: number;
  utilizationPercent: number;
}

export function getDatabasePageStats(db: Database): DatabasePageStats | null {
  try {
    const pageCount = db.prepare('PRAGMA page_count').value<[number]>()?.[0] ?? 0;
    const freeListCount = db.prepare('PRAGMA freelist_count').value<[number]>()?.[0] ?? 0;
    const pageSize = db.prepare('PRAGMA page_size').value<[number]>()?.[0] ?? 4096;

    const totalSize = pageCount * pageSize;
    const freeSpace = freeListCount * pageSize;
    const usedPages = pageCount - freeListCount;
    const utilizationPercent = pageCount > 0 ? (usedPages / pageCount) * 100 : 100;

    return {
      pageCount,
      freeListCount,
      pageSize,
      totalSize,
      freeSpace,
      utilizationPercent,
    };
  } catch {
    return null;
  }
}
