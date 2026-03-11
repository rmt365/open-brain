/**
 * Timeout utilities for database operations
 */

/**
 * Wrap an async operation with a timeout
 *
 * @param operation - The promise to wrap with a timeout
 * @param timeoutMs - Timeout in milliseconds
 * @param operationName - Name of the operation for error messages
 * @returns The result of the operation
 * @throws Error if the operation times out
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   fetchData(),
 *   5000,
 *   "fetchData"
 * );
 * ```
 */
export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  let timeoutId: number | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Default timeouts for database operations (in milliseconds)
 */
export const TIMEOUTS = {
  /** Backup operation timeout (5 minutes) */
  BACKUP: 5 * 60 * 1000,

  /** Restore operation timeout (5 minutes) */
  RESTORE: 5 * 60 * 1000,

  /** Repair operation timeout (10 minutes) */
  REPAIR: 10 * 60 * 1000,

  /** Health check timeout (30 seconds) */
  HEALTH_CHECK: 30 * 1000,

  /** S3 operation timeout (2 minutes) */
  S3_OPERATION: 2 * 60 * 1000,

  /** SQLite command timeout (60 seconds) */
  SQLITE_COMMAND: 60 * 1000,

  /** WAL checkpoint timeout (30 seconds) */
  WAL_CHECKPOINT: 30 * 1000,
} as const;

/**
 * Create a timeout error with additional context
 */
export class TimeoutError extends Error {
  public readonly operationName: string;
  public readonly timeoutMs: number;

  constructor(operationName: string, timeoutMs: number) {
    super(`${operationName} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.operationName = operationName;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Wrap an async operation with a timeout that throws TimeoutError
 */
export async function withTimeoutError<T>(
  operation: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  let timeoutId: number | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(operationName, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
