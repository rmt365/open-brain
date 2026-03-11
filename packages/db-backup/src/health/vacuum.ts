/**
 * Database optimization and VACUUM utilities
 */

import type { VacuumResult } from '../types.ts';
import { getDatabaseSize } from '../backup/sqliteBackup.ts';
import { withDatabase, getDatabasePageStats } from './common.ts';

/**
 * Run VACUUM on a database to reclaim space
 */
export async function vacuum(dbPath: string): Promise<VacuumResult> {
  const startTime = Date.now();

  try {
    const sizeBefore = await getDatabaseSize(dbPath);

    withDatabase(dbPath, (db) => {
      db.exec('VACUUM');
    });

    const sizeAfter = await getDatabaseSize(dbPath);
    const spaceReclaimed = sizeBefore - sizeAfter;

    return {
      success: true,
      sizeBefore,
      sizeAfter,
      spaceReclaimed,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      sizeBefore: 0,
      sizeAfter: 0,
      spaceReclaimed: 0,
      duration: Date.now() - startTime,
      error: (error as Error).message,
    };
  }
}

/**
 * Check if VACUUM would be beneficial
 * Returns true if more than 10% of pages are free
 */
export function shouldVacuum(dbPath: string): boolean {
  return withDatabase(dbPath, (db) => {
    const stats = getDatabasePageStats(db);
    if (!stats) return false;

    // VACUUM is beneficial if more than 10% of pages are free
    return stats.utilizationPercent < 90;
  });
}

/**
 * Enable auto-vacuum for a database
 */
export function enableAutoVacuum(
  dbPath: string,
  mode: 'NONE' | 'FULL' | 'INCREMENTAL' = 'INCREMENTAL'
): void {
  withDatabase(dbPath, (db) => {
    const modeValue = mode === 'NONE' ? 0 : mode === 'FULL' ? 1 : 2;
    db.exec(`PRAGMA auto_vacuum = ${modeValue}`);
    db.exec('VACUUM'); // Apply the setting
  });
}

/**
 * Database statistics interface
 */
export interface DatabaseStats {
  pageSize: number;
  pageCount: number;
  freelistCount: number;
  totalSize: number;
  freeSpace: number;
  utilizationPercentage: number;
}

/**
 * Get database statistics
 */
export function getDatabaseStats(dbPath: string): DatabaseStats {
  return withDatabase(dbPath, (db) => {
    const stats = getDatabasePageStats(db);
    if (!stats) {
      return {
        pageSize: 0,
        pageCount: 0,
        freelistCount: 0,
        totalSize: 0,
        freeSpace: 0,
        utilizationPercentage: 0,
      };
    }

    return {
      pageSize: stats.pageSize,
      pageCount: stats.pageCount,
      freelistCount: stats.freeListCount,
      totalSize: stats.totalSize,
      freeSpace: stats.freeSpace,
      utilizationPercentage: stats.utilizationPercent,
    };
  });
}
