/**
 * Database health checking and integrity verification
 */

import type { IntegrityResult, HealthCheckConfig } from '../types.ts';
import { withDatabase } from './common.ts';

/**
 * Run integrity checks on a database
 */
export function checkIntegrity(
  dbPath: string,
  config?: HealthCheckConfig
): IntegrityResult {
  return withDatabase(dbPath, (db) => {
    const result: IntegrityResult = {
      ok: true,
      checks: {
        foreignKeys: true,
        quickCheck: true,
        integrityCheck: true,
      },
      errors: [],
      warnings: [],
    };

    // 1. Foreign key check
    if (config?.checkForeignKeys !== false) {
      try {
        db.exec('PRAGMA foreign_keys = ON');
        const fkErrors = db.prepare('PRAGMA foreign_key_check').all<{
          table: string;
          rowid: number;
          parent: string;
          fkid: number;
        }>();

        if (fkErrors.length > 0) {
          result.checks.foreignKeys = false;
          result.ok = false;
          for (const error of fkErrors) {
            result.errors.push(
              `Foreign key violation in ${error.table} (rowid ${error.rowid}): references ${error.parent}`
            );
          }
        }
      } catch (error) {
        result.warnings.push(`Foreign key check failed: ${(error as Error).message}`);
      }
    }

    // 2. Quick check (fast check for common issues)
    if (config?.quickCheck !== false) {
      try {
        const quickCheck = db.prepare('PRAGMA quick_check').all<{ quick_check: string }>();

        for (const row of quickCheck) {
          const msg = row.quick_check || String(Object.values(row)[0]);
          if (msg !== 'ok') {
            result.checks.quickCheck = false;
            result.ok = false;
            result.errors.push(`Quick check: ${msg}`);
          }
        }
      } catch (error) {
        result.checks.quickCheck = false;
        result.ok = false;
        result.errors.push(`Quick check failed: ${(error as Error).message}`);
      }
    }

    // 3. Full integrity check (thorough but slower)
    if (config?.fullIntegrityCheck) {
      try {
        const integrityCheck = db.prepare('PRAGMA integrity_check').all<{ integrity_check: string }>();

        for (const row of integrityCheck) {
          const msg = row.integrity_check || String(Object.values(row)[0]);
          if (msg !== 'ok') {
            result.checks.integrityCheck = false;
            result.ok = false;
            result.errors.push(`Integrity check: ${msg}`);
          }
        }
      } catch (error) {
        result.checks.integrityCheck = false;
        result.ok = false;
        result.errors.push(`Integrity check failed: ${(error as Error).message}`);
      }
    }

    // 4. Check for database corruption indicators
    try {
      db.prepare('SELECT * FROM sqlite_master LIMIT 1').all();
    } catch (error) {
      result.ok = false;
      result.errors.push(`Database may be corrupted: ${(error as Error).message}`);
    }

    return result;
  });
}

/**
 * Verify backup can be restored
 */
export async function verifyBackup(backupPath: string): Promise<boolean> {
  try {
    const result = checkIntegrity(backupPath, {
      checkForeignKeys: true,
      quickCheck: true,
      fullIntegrityCheck: false,
    });
    return result.ok;
  } catch (error) {
    console.error('Backup verification failed:', error);
    return false;
  }
}
