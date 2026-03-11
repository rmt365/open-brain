/**
 * Database health scheduler
 * Runs periodic integrity checks and alerts on issues
 * Does NOT attempt repair - that requires service restart
 */

import { checkIntegrity } from './integrity.ts';
import { checkpointWAL } from './common.ts';
import type { IntegrityResult } from '../types.ts';

export interface HealthSchedulerConfig {
  /** Path to the database file */
  dbPath: string;
  /** Service name for logging */
  service: string;
  /** Check interval in milliseconds (default: 30 minutes) */
  intervalMs?: number;
  /** Callback when issues are detected */
  onIssueDetected?: (result: IntegrityResult) => void;
}

export interface HealthSchedulerHandle {
  /** Run a health check immediately */
  runCheck(): Promise<IntegrityResult>;
  /** Stop the scheduler */
  stop(): void;
  /** Check if scheduler is running */
  isRunning(): boolean;
}

/**
 * Start periodic database health monitoring
 * Returns a handle to control the scheduler
 */
export function startHealthScheduler(config: HealthSchedulerConfig): HealthSchedulerHandle {
  const {
    dbPath,
    service,
    intervalMs = 30 * 60 * 1000,
    onIssueDetected = (r) => console.error(`[${service}] Database issues detected:`, r.errors),
  } = config;

  let intervalId: number | null = null;

  const runCheck = async (): Promise<IntegrityResult> => {
    // Non-blocking checkpoint before check
    checkpointWAL(dbPath, 'PASSIVE');

    const result = checkIntegrity(dbPath, {
      checkForeignKeys: true,
      quickCheck: true,
      fullIntegrityCheck: false,
    });

    if (!result.ok) {
      console.error(`[${service}] Periodic health check failed - restart recommended`);
      try {
        onIssueDetected(result);
      } catch (callbackError) {
        // Don't let callback errors crash the scheduler
        console.error(`[${service}] onIssueDetected callback threw:`, callbackError);
      }
    } else {
      console.log(`[${service}] Periodic health check passed`);
    }

    return result;
  };

  // Start the interval
  console.log(`[${service}] Health scheduler started (interval: ${intervalMs}ms)`);
  intervalId = setInterval(runCheck, intervalMs);

  return {
    runCheck,
    stop: () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
        console.log(`[${service}] Health scheduler stopped`);
      }
    },
    isRunning: () => intervalId !== null,
  };
}

/**
 * Database health scheduler class (backward compatible)
 * Wraps the function-based API
 */
export class DatabaseHealthScheduler {
  private handle: HealthSchedulerHandle | null = null;
  private config: HealthSchedulerConfig;

  constructor(config: HealthSchedulerConfig) {
    this.config = config;
  }

  /** Start periodic health checks */
  start(): void {
    if (!this.handle) {
      this.handle = startHealthScheduler(this.config);
    }
  }

  /** Stop periodic health checks */
  stop(): void {
    this.handle?.stop();
    this.handle = null;
  }

  /** Run a health check manually */
  async runCheck(): Promise<IntegrityResult> {
    if (this.handle) {
      return this.handle.runCheck();
    }
    // Run one-off check if scheduler not started
    checkpointWAL(this.config.dbPath, 'PASSIVE');
    return checkIntegrity(this.config.dbPath, {
      checkForeignKeys: true,
      quickCheck: true,
      fullIntegrityCheck: false,
    });
  }

  /** Check if scheduler is running */
  isRunning(): boolean {
    return this.handle?.isRunning() ?? false;
  }
}
