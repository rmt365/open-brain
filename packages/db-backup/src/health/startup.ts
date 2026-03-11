/**
 * Database startup health check utility
 * Runs integrity checks before service initialization and optionally auto-repairs
 *
 * Recovery priority:
 * 1. Litestream restore (if DB missing and enabled) - seconds-old data
 * 2. Integrity check
 * 3. Auto-repair (REINDEX → Litestream → Backup) if corrupted
 */

import { checkIntegrity } from './integrity.ts';
import { autoRepair } from './repair.ts';
import { checkpointWAL } from './common.ts';
import { restoreFromLitestream } from '../litestream/restore.ts';
import type { WasabiConfig } from '../litestream/config.ts';
import type { IntegrityResult, RepairResult } from '../types.ts';

export interface StartupHealthConfig {
  /** Path to the database file */
  dbPath: string;
  /** Service name for logging */
  service: string;
  /** Attempt auto-repair on corruption (default: false) */
  autoRepair?: boolean;
  /** Throw error on corruption instead of degraded mode (default: false) */
  failOnCorruption?: boolean;
  /** Run full integrity check instead of quick check (default: false) */
  fullCheck?: boolean;
  /** Enable Litestream restore for missing database */
  enableLitestream?: boolean;
  /** Environment for Litestream (production, staging, dev) */
  environment?: string;
  /** Wasabi configuration for Litestream */
  wasabi?: WasabiConfig;
  /**
   * Allow database recreation as last resort repair strategy.
   * WARNING: This will DELETE ALL DATA if other repair strategies fail!
   * Only enable for non-critical databases (e.g., tracking/logging).
   */
  allowRecreate?: boolean;
}

export interface StartupHealthResult {
  /** Database is healthy and ready */
  healthy: boolean;
  /** Service should run in degraded mode */
  degraded: boolean;
  /** Integrity check results */
  integrityResult: IntegrityResult;
  /** Repair results if repair was attempted */
  repairResult?: RepairResult;
  /** Whether database was restored from Litestream */
  restoredFromLitestream?: boolean;
  /** Litestream generation ID if restored */
  litestreamGeneration?: string;
  /** Error message if degraded */
  error?: string;
}

/**
 * Run startup health check on database
 * Should be called BEFORE initializing DatabaseManager
 */
export async function checkStartupHealth(
  config: StartupHealthConfig
): Promise<StartupHealthResult> {
  const {
    dbPath,
    service,
    autoRepair: doRepair = false,
    failOnCorruption = false,
    fullCheck = false,
    enableLitestream = false,
    environment = 'dev',
    wasabi,
    allowRecreate = false,
  } = config;

  console.log(`[${service}] Running startup database health check...`);

  // Track if we restored from Litestream
  let restoredFromLitestream = false;
  let litestreamGeneration: string | undefined;

  // Step 0: Restore from Litestream if database is missing
  if (enableLitestream && wasabi) {
    const dbExists = await checkDatabaseExists(dbPath);
    if (!dbExists) {
      console.log(`[${service}] Database missing. Attempting Litestream restore...`);

      const restoreResult = await restoreFromLitestream({
        service,
        environment,
        targetPath: dbPath,
        wasabi,
        ifNotExists: true,
      });

      if (restoreResult.success) {
        console.log(`[${service}] Restored from Litestream (generation: ${restoreResult.generationId || 'unknown'})`);
        restoredFromLitestream = true;
        litestreamGeneration = restoreResult.generationId;
      } else {
        console.warn(`[${service}] Litestream restore failed: ${restoreResult.error}`);
        console.warn(`[${service}] This is expected for new services without existing replicas`);
      }
    }
  }

  // Checkpoint WAL to ensure consistent state before checking
  if (!checkpointWAL(dbPath, 'TRUNCATE')) {
    console.warn(`[${service}] WAL checkpoint skipped (database may not exist yet)`);
  }

  // Run integrity check
  const integrityResult = checkIntegrity(dbPath, {
    checkForeignKeys: true,
    quickCheck: true,
    fullIntegrityCheck: fullCheck,
  });

  if (integrityResult.ok) {
    console.log(`[${service}] Database health check passed`);
    return {
      healthy: true,
      degraded: false,
      integrityResult,
      restoredFromLitestream,
      litestreamGeneration,
    };
  }

  console.error(`[${service}] Database corruption detected:`, integrityResult.errors);

  // Attempt repair if enabled
  if (doRepair) {
    console.log(`[${service}] Attempting auto-repair...`);
    const repairResult = await autoRepair(dbPath, undefined, service, undefined, { allowRecreate });

    if (repairResult.success) {
      console.log(`[${service}] Repair successful (strategy: ${repairResult.repairStrategy})`);
      return {
        healthy: true,
        degraded: false,
        integrityResult: repairResult.integrityAfterRepair || integrityResult,
        repairResult,
        restoredFromLitestream,
        litestreamGeneration,
      };
    }

    console.error(`[${service}] Repair failed:`, repairResult.error);

    if (failOnCorruption) {
      throw new Error(`Database corruption could not be repaired: ${repairResult.error}`);
    }

    return {
      healthy: false,
      degraded: true,
      integrityResult,
      repairResult,
      restoredFromLitestream,
      litestreamGeneration,
      error: repairResult.error,
    };
  }

  // No repair attempted, check if we should fail or degrade
  if (failOnCorruption) {
    throw new Error(`Database corrupted: ${integrityResult.errors.join(', ')}`);
  }

  console.warn(`[${service}] Entering degraded mode`);
  return {
    healthy: false,
    degraded: true,
    integrityResult,
    restoredFromLitestream,
    litestreamGeneration,
    error: 'Database corruption detected, auto-repair disabled',
  };
}

/**
 * Check if a database file exists
 */
async function checkDatabaseExists(dbPath: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(dbPath);
    return stat.isFile;
  } catch {
    return false;
  }
}
