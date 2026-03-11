/**
 * Litestream health monitoring
 *
 * Provides functions to check the health of Litestream replication.
 */

import { getLitestreamPath, type WasabiConfig } from "./config.ts";
import { getLatestGeneration } from "./restore.ts";

/**
 * Litestream health status
 */
export interface LitestreamHealthStatus {
  /** Whether Litestream is configured/enabled */
  enabled: boolean;
  /** Whether Litestream process appears to be running (based on recent activity) */
  running: boolean;
  /** Timestamp of the last successful replication */
  lastReplicatedAt: Date | null;
  /** Seconds since last replication (replication lag) */
  lagSeconds: number;
  /** ID of the latest generation */
  latestGeneration: string | null;
  /** Timestamp of the latest snapshot */
  latestSnapshot: Date | null;
  /** Any errors encountered during health check */
  errors: string[];
}

/**
 * Check the health of Litestream replication for a service
 *
 * This checks the Wasabi S3 replica to determine:
 * - Whether any generations exist
 * - When the last replication occurred
 * - The current replication lag
 *
 * @param service - Service name
 * @param environment - Environment name
 * @param wasabi - Wasabi S3 configuration
 * @returns Litestream health status
 */
export async function checkLitestreamHealth(
  service: string,
  environment: string,
  wasabi: WasabiConfig
): Promise<LitestreamHealthStatus> {
  const errors: string[] = [];

  // Check if credentials are configured
  if (!wasabi.accessKeyId || !wasabi.secretAccessKey) {
    return {
      enabled: false,
      running: false,
      lastReplicatedAt: null,
      lagSeconds: -1,
      latestGeneration: null,
      latestSnapshot: null,
      errors: ["Wasabi credentials not configured"],
    };
  }

  try {
    // Get the latest generation to determine replication status
    const latestGen = await getLatestGeneration(service, environment, wasabi);

    if (!latestGen) {
      return {
        enabled: true,
        running: false,
        lastReplicatedAt: null,
        lagSeconds: -1,
        latestGeneration: null,
        latestSnapshot: null,
        errors: ["No generations found - replication may not be active"],
      };
    }

    // Calculate lag based on generation's last update
    const now = new Date();
    const lagMs = now.getTime() - latestGen.updatedAt.getTime();
    const lagSeconds = Math.floor(lagMs / 1000);

    // Consider "running" if we've seen activity in the last 5 minutes
    const isRunning = lagSeconds < 300; // 5 minutes

    // Check for stale replication (> 1 hour)
    if (lagSeconds > 3600) {
      errors.push(`Replication appears stale (last update: ${latestGen.updatedAt.toISOString()})`);
    }

    return {
      enabled: true,
      running: isRunning,
      lastReplicatedAt: latestGen.updatedAt,
      lagSeconds,
      latestGeneration: latestGen.id,
      latestSnapshot: null, // Would need additional S3 query to get snapshot info
      errors,
    };
  } catch (error) {
    return {
      enabled: true,
      running: false,
      lastReplicatedAt: null,
      lagSeconds: -1,
      latestGeneration: null,
      latestSnapshot: null,
      errors: [`Health check failed: ${(error as Error).message}`],
    };
  }
}

/**
 * Quick check if Litestream replication is healthy
 *
 * @param service - Service name
 * @param environment - Environment name
 * @param wasabi - Wasabi S3 configuration
 * @param maxLagSeconds - Maximum acceptable lag in seconds (default: 60)
 * @returns True if replication is healthy (lag within threshold)
 */
export async function isLitestreamHealthy(
  service: string,
  environment: string,
  wasabi: WasabiConfig,
  maxLagSeconds: number = 60
): Promise<boolean> {
  const health = await checkLitestreamHealth(service, environment, wasabi);
  return health.enabled && health.running && health.lagSeconds >= 0 && health.lagSeconds <= maxLagSeconds;
}

/**
 * Get a summary string for Litestream health status
 *
 * @param status - Litestream health status
 * @returns Human-readable summary string
 */
export function getLitestreamHealthSummary(status: LitestreamHealthStatus): string {
  if (!status.enabled) {
    return "Litestream: disabled";
  }

  if (!status.running) {
    return `Litestream: not running (${status.errors.join(", ")})`;
  }

  if (status.lagSeconds < 0) {
    return "Litestream: unknown status";
  }

  if (status.lagSeconds < 10) {
    return `Litestream: healthy (lag: <10s)`;
  }

  if (status.lagSeconds < 60) {
    return `Litestream: healthy (lag: ${status.lagSeconds}s)`;
  }

  if (status.lagSeconds < 300) {
    return `Litestream: warning (lag: ${Math.floor(status.lagSeconds / 60)}m)`;
  }

  return `Litestream: stale (lag: ${Math.floor(status.lagSeconds / 60)}m)`;
}

/**
 * Format Litestream health status for JSON response
 *
 * @param status - Litestream health status
 * @returns Formatted object suitable for health endpoint response
 */
export function formatLitestreamHealthResponse(status: LitestreamHealthStatus): {
  enabled: boolean;
  running: boolean;
  lastReplicatedAt: string | null;
  lagSeconds: number;
  latestGeneration: string | null;
  status: "healthy" | "warning" | "error" | "disabled";
} {
  let healthStatus: "healthy" | "warning" | "error" | "disabled";

  if (!status.enabled) {
    healthStatus = "disabled";
  } else if (!status.running || status.lagSeconds < 0) {
    healthStatus = "error";
  } else if (status.lagSeconds > 300) {
    healthStatus = "warning";
  } else {
    healthStatus = "healthy";
  }

  return {
    enabled: status.enabled,
    running: status.running,
    lastReplicatedAt: status.lastReplicatedAt?.toISOString() || null,
    lagSeconds: status.lagSeconds,
    latestGeneration: status.latestGeneration,
    status: healthStatus,
  };
}
