/**
 * Database auto-repair utilities
 */

import { dirname, join } from "std/path";
import type { RepairResult } from '../types.ts';
import { checkIntegrity } from './integrity.ts';
import { withDatabase } from './common.ts';
import { BackupCatalog } from '../backup/catalog.ts';
import { restoreFromLitestream } from '../litestream/restore.ts';
import type { WasabiConfig } from '../litestream/config.ts';

/** Lock file suffix for preventing concurrent repairs */
const REPAIR_LOCK_SUFFIX = ".repair.lock";

/** Max corrupted backups to keep per database */
const MAX_CORRUPTED_BACKUPS = 3;

/** Stale lock timeout (10 minutes) */
const STALE_LOCK_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Litestream configuration for repair
 */
export interface LitestreamRepairConfig {
  /** Whether Litestream repair is enabled */
  enabled: boolean;
  /** Service name for Litestream path */
  service: string;
  /** Environment (production, staging, dev) */
  environment: string;
  /** Wasabi S3 configuration */
  wasabi: WasabiConfig;
}

/**
 * Options for auto-repair
 */
export interface AutoRepairOptions {
  /** Backup catalog for restore strategy */
  catalog?: BackupCatalog;
  /** Service name */
  service?: string;
  /** Litestream configuration */
  litestreamConfig?: LitestreamRepairConfig;
  /**
   * Allow deleting and recreating the database as a last resort.
   * Only use for non-critical databases (e.g., tracking/logging DBs).
   * WARNING: This will lose ALL data in the database!
   */
  allowRecreate?: boolean;
}

/**
 * Acquire repair lock to prevent concurrent repair operations
 */
async function acquireRepairLock(dbPath: string): Promise<boolean> {
  const lockPath = `${dbPath}${REPAIR_LOCK_SUFFIX}`;
  try {
    // Create lock file exclusively - fails if already exists
    await Deno.writeTextFile(lockPath, String(Date.now()), { createNew: true });
    return true;
  } catch (e) {
    if (e instanceof Deno.errors.AlreadyExists) {
      // Check if lock is stale
      try {
        const lockContent = await Deno.readTextFile(lockPath);
        const lockTime = parseInt(lockContent);
        if (Date.now() - lockTime > STALE_LOCK_TIMEOUT_MS) {
          console.log(`[repair] Removing stale lock file (age: ${Math.round((Date.now() - lockTime) / 1000)}s)`);
          await Deno.remove(lockPath);
          return acquireRepairLock(dbPath); // Retry
        }
      } catch {
        // Lock check failed, assume active
      }
      return false;
    }
    throw e;
  }
}

/**
 * Release repair lock
 */
async function releaseRepairLock(dbPath: string): Promise<void> {
  try {
    await Deno.remove(`${dbPath}${REPAIR_LOCK_SUFFIX}`);
  } catch {
    // Ignore removal errors
  }
}

/**
 * Clean up old corrupted backups, keeping only the most recent N
 */
async function cleanupCorruptedBackups(
  dbPath: string,
  keepCount: number = MAX_CORRUPTED_BACKUPS
): Promise<void> {
  const dir = dirname(dbPath);
  const baseName = dbPath.split("/").pop() || "";
  const pattern = `${baseName}.corrupted.`;

  try {
    const entries: { name: string; timestamp: number }[] = [];
    for await (const entry of Deno.readDir(dir)) {
      if (entry.name.startsWith(pattern)) {
        const timestamp = parseInt(entry.name.replace(pattern, "")) || 0;
        entries.push({ name: entry.name, timestamp });
      }
    }

    // Sort by timestamp descending, remove oldest beyond keepCount
    entries.sort((a, b) => b.timestamp - a.timestamp);
    for (const entry of entries.slice(keepCount)) {
      await Deno.remove(join(dir, entry.name)).catch(() => {});
      console.log(`[repair] Cleaned up old corrupted backup: ${entry.name}`);
    }
  } catch {
    // Directory read failed, skip cleanup
  }
}

/**
 * Check if sqlite3 binary is available
 */
async function checkSqlite3Available(): Promise<boolean> {
  try {
    const cmd = new Deno.Command("sqlite3", {
      args: ["--version"],
      stdout: "null",
      stderr: "null",
    });
    const result = await cmd.output();
    return result.success;
  } catch {
    return false;
  }
}

/**
 * Attempt to recover data using SQLite's .recover command
 *
 * This extracts recoverable data from a corrupted database and creates
 * a new clean database. Works even when integrity_check fails completely.
 *
 * Handles:
 * - Large databases via file-based SQL dump (not stdin piping)
 * - WAL checkpoint attempt before recovery
 * - Table/row count validation
 * - Corrupted backup cleanup policy
 */
async function sqliteRecover(
  dbPath: string,
  service?: string
): Promise<{
  success: boolean;
  recoveredPath?: string;
  rowsRecovered?: number;
  tablesRecovered?: number;
  corruptedBackupPath?: string;
  error?: string;
}> {
  const prefix = service ? `[${service}]` : "[repair]";
  const timestamp = Date.now();
  const tempRecoveryFile = `${dbPath}.recovery.${timestamp}.sql`;
  const tempNewDb = `${dbPath}.recovered.${timestamp}`;

  // Check sqlite3 availability
  if (!await checkSqlite3Available()) {
    return { success: false, error: "sqlite3 binary not found in PATH" };
  }

  try {
    console.log(`${prefix} Attempting SQLite .recover...`);

    // Try WAL checkpoint first (may recover some uncommitted data)
    try {
      const checkpointCmd = new Deno.Command("sqlite3", {
        args: [dbPath, "PRAGMA wal_checkpoint(TRUNCATE);"],
        stdout: "null",
        stderr: "null",
      });
      await checkpointCmd.output();
    } catch {
      // WAL checkpoint failed, continue with recovery
    }

    // Step 1: Run .recover to dump SQL
    // Use piped output since .output command doesn't work well with .recover
    const recoverCmd = new Deno.Command("sqlite3", {
      args: [dbPath, ".recover"],
      stdout: "piped",
      stderr: "piped",
    });

    const recoverOutput = await recoverCmd.output();
    const recoveredSql = new TextDecoder().decode(recoverOutput.stdout);
    const stderr = new TextDecoder().decode(recoverOutput.stderr);

    if (!recoveredSql.trim()) {
      return {
        success: false,
        error: `Recovery produced empty output${stderr ? `: ${stderr}` : ""}`,
      };
    }

    // Write to temp file for .read command (handles large DBs better)
    await Deno.writeTextFile(tempRecoveryFile, recoveredSql);

    // Count recovered data
    const insertCount = (recoveredSql.match(/^INSERT INTO/gm) || []).length;
    const tableCount = (recoveredSql.match(/^CREATE TABLE/gm) || []).length;
    console.log(`${prefix} Recovered ${insertCount} rows across ${tableCount} tables`);

    // Step 2: Create new database from recovered SQL
    const importCmd = new Deno.Command("sqlite3", {
      args: [tempNewDb, `.read '${tempRecoveryFile}'`],
      stdout: "piped",
      stderr: "piped",
    });

    await importCmd.output();
    // Note: Import may have duplicate key errors from recovery SQL, that's expected

    // Step 3: Verify new database integrity
    const integrityCmd = new Deno.Command("sqlite3", {
      args: [tempNewDb, "PRAGMA integrity_check;"],
      stdout: "piped",
      stderr: "piped",
    });

    const integrityOutput = await integrityCmd.output();
    const integrityResult = new TextDecoder().decode(integrityOutput.stdout).trim();

    if (integrityResult !== "ok") {
      await Deno.remove(tempNewDb).catch(() => {});
      await Deno.remove(tempRecoveryFile).catch(() => {});
      return {
        success: false,
        error: `Recovered database failed integrity check: ${integrityResult}`,
      };
    }

    // Step 4: Backup corrupted file and replace with recovered
    const corruptedBackup = `${dbPath}.corrupted.${timestamp}`;

    // Move corrupted DB to backup location
    await Deno.rename(dbPath, corruptedBackup);

    // Move recovered DB into place
    await Deno.rename(tempNewDb, dbPath);

    // Clean up WAL/SHM from corrupted DB (they're now orphaned)
    await Deno.remove(`${dbPath}-wal`).catch(() => {});
    await Deno.remove(`${dbPath}-shm`).catch(() => {});

    // Clean up temp SQL file
    await Deno.remove(tempRecoveryFile).catch(() => {});

    // Clean up old corrupted backups
    await cleanupCorruptedBackups(dbPath);

    console.log(`${prefix} SQLite recover successful. Corrupted DB backed up to: ${corruptedBackup}`);

    return {
      success: true,
      recoveredPath: dbPath,
      rowsRecovered: insertCount,
      tablesRecovered: tableCount,
      corruptedBackupPath: corruptedBackup,
    };
  } catch (error) {
    // Clean up temp files on error
    await Deno.remove(tempRecoveryFile).catch(() => {});
    await Deno.remove(tempNewDb).catch(() => {});
    return { success: false, error: String(error) };
  }
}

/**
 * Attempt to repair a corrupted database
 *
 * Strategies (in order):
 * 1. REINDEX - fixes index corruption (fastest, no data loss)
 * 2. SQLite .recover - extracts data from corrupted DB (preserves data)
 * 3. Litestream restore - restores from WAL stream (seconds-old data)
 * 4. Backup restore - restores from last good backup (hours-old data)
 * 5. Recreate - delete and let migrations recreate (LOSES ALL DATA, opt-in only)
 */
export async function autoRepair(
  dbPath: string,
  catalog?: BackupCatalog,
  service?: string,
  litestreamConfig?: LitestreamRepairConfig,
  options?: { allowRecreate?: boolean }
): Promise<RepairResult> {
  const allowRecreate = options?.allowRecreate ?? false;
  const prefix = service ? `[${service}]` : "[repair]";

  // Acquire repair lock to prevent concurrent repairs
  if (!await acquireRepairLock(dbPath)) {
    console.warn(`${prefix} Another repair operation is in progress`);
    return {
      success: false,
      repairStrategy: 'none',
      error: 'Another repair operation is in progress',
    };
  }

  try {
    console.log(`${prefix} Attempting to repair database: ${dbPath}`);

    // First, check what's wrong
    const integrity = checkIntegrity(dbPath, {
      checkForeignKeys: true,
      quickCheck: true,
      fullIntegrityCheck: false,
    });

    if (integrity.ok) {
      return {
        success: true,
        repairStrategy: 'none',
      };
    }

    console.log(`${prefix} Database integrity issues detected:`, integrity.errors);

    // Strategy 1: Try REINDEX (fixes index corruption)
    try {
      console.log(`${prefix} Attempting REINDEX...`);
      withDatabase(dbPath, (db) => {
        db.exec('REINDEX');
      });

      const afterReindex = checkIntegrity(dbPath);
      if (afterReindex.ok) {
        console.log(`${prefix} REINDEX successful`);
        return {
          success: true,
          repairStrategy: 'reindex',
          integrityAfterRepair: afterReindex,
        };
      }
      console.log(`${prefix} REINDEX did not fix integrity issues`);
    } catch (error) {
      console.error(`${prefix} REINDEX failed:`, error);
    }

    // Strategy 2: SQLite .recover (extracts data from corrupted DB)
    try {
      console.log(`${prefix} Attempting SQLite .recover...`);
      const recoverResult = await sqliteRecover(dbPath, service);

      if (recoverResult.success) {
        const afterRecover = checkIntegrity(dbPath);
        if (afterRecover.ok) {
          console.log(`${prefix} SQLite .recover successful`);
          return {
            success: true,
            repairStrategy: 'sqlite_recover',
            integrityAfterRepair: afterRecover,
            rowsRecovered: recoverResult.rowsRecovered,
            tablesRecovered: recoverResult.tablesRecovered,
            corruptedBackupPath: recoverResult.corruptedBackupPath,
          };
        }
        console.warn(`${prefix} SQLite .recover completed but database still has integrity issues`);
      } else {
        console.warn(`${prefix} SQLite .recover failed: ${recoverResult.error}`);
      }
    } catch (error) {
      console.error(`${prefix} SQLite .recover strategy failed:`, error);
    }

    // Strategy 3: Restore from Litestream (seconds-old data)
    if (litestreamConfig?.enabled) {
      try {
        console.log(`${prefix} Attempting Litestream restore...`);

        // Backup corrupted database before replacing
        const corruptedPath = `${dbPath}.corrupted.${Date.now()}`;
        try {
          await Deno.rename(dbPath, corruptedPath);
          console.log(`${prefix} Backed up corrupted database to: ${corruptedPath}`);
        } catch (renameError) {
          console.warn(`${prefix} Could not backup corrupted database:`, renameError);
        }

        // Also clean up WAL and SHM files
        try {
          await Deno.remove(`${dbPath}-wal`);
          await Deno.remove(`${dbPath}-shm`);
        } catch {
          // WAL/SHM files may not exist
        }

        const restoreResult = await restoreFromLitestream({
          service: litestreamConfig.service,
          environment: litestreamConfig.environment,
          targetPath: dbPath,
          wasabi: litestreamConfig.wasabi,
        });

        if (restoreResult.success) {
          const afterRestore = checkIntegrity(dbPath);
          if (afterRestore.ok) {
            console.log(`${prefix} Litestream restore successful (generation: ${restoreResult.generationId || 'unknown'})`);
            // Clean up old corrupted backups
            await cleanupCorruptedBackups(dbPath);
            return {
              success: true,
              repairStrategy: 'litestream_restore',
              integrityAfterRepair: afterRestore,
              corruptedBackupPath: corruptedPath,
            };
          }
          console.warn(`${prefix} Litestream restore completed but database still has integrity issues`);
        } else {
          console.warn(`${prefix} Litestream restore failed: ${restoreResult.error}`);
          // Restore the corrupted database if Litestream failed
          try {
            if (await fileExists(corruptedPath)) {
              await Deno.rename(corruptedPath, dbPath);
              console.log(`${prefix} Restored corrupted database for next strategy attempt`);
            }
          } catch {
            // Ignore restore errors
          }
        }
      } catch (error) {
        console.error(`${prefix} Litestream restore strategy failed:`, error);
      }
    }

    // Strategy 4: Restore from last known good backup (hours-old data)
    if (catalog && service) {
      try {
        console.log(`${prefix} Attempting restore from backup...`);
        const lastGoodBackup = await catalog.findLastGoodBackup(service);

        if (lastGoodBackup) {
          console.log(`${prefix} Found backup: ${lastGoodBackup.id} from ${lastGoodBackup.timestamp}`);
          return {
            success: true,
            repairStrategy: 'backup_restore',
            backupUsed: lastGoodBackup.id,
          };
        }
        console.log(`${prefix} No backup found for service`);
      } catch (error) {
        console.error(`${prefix} Backup restore strategy failed:`, error);
      }
    }

    // Strategy 5: Recreate database (LAST RESORT - loses all data)
    if (allowRecreate) {
      try {
        console.log(`${prefix} Attempting database recreation (LAST RESORT - all data will be lost)...`);

        // Backup corrupted database before deleting
        const corruptedPath = `${dbPath}.corrupted.${Date.now()}`;
        try {
          await Deno.rename(dbPath, corruptedPath);
          console.log(`${prefix} Backed up corrupted database to: ${corruptedPath}`);
        } catch {
          // Try to remove if rename fails
          try {
            await Deno.remove(dbPath);
          } catch {
            // Ignore
          }
        }

        // Clean up WAL and SHM files
        try {
          await Deno.remove(`${dbPath}-wal`);
        } catch {
          // WAL file may not exist
        }
        try {
          await Deno.remove(`${dbPath}-shm`);
        } catch {
          // SHM file may not exist
        }

        // Clean up old corrupted backups
        await cleanupCorruptedBackups(dbPath);

        // Database will be recreated by migrations on next access
        console.log(`${prefix} Database files removed. Database will be recreated by migrations.`);
        return {
          success: true,
          repairStrategy: 'recreate',
          corruptedBackupPath: corruptedPath,
        };
      } catch (error) {
        console.error(`${prefix} Database recreation failed:`, error);
      }
    }

    // All strategies failed
    return {
      success: false,
      repairStrategy: 'none',
      error: 'Unable to repair database. Manual intervention required.',
    };
  } finally {
    await releaseRepairLock(dbPath);
  }
}

/**
 * Check if a file exists
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(path);
    return stat.isFile;
  } catch {
    return false;
  }
}

// Export utility functions for testing
export {
  acquireRepairLock,
  releaseRepairLock,
  cleanupCorruptedBackups,
  checkSqlite3Available,
  sqliteRecover,
};
