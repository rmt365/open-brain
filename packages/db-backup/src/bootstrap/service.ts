/**
 * Service bootstrap helper
 * Provides a unified startup pattern for services with database health checks
 */

import { Hono } from "@hono/hono";
import { checkStartupHealth, type StartupHealthResult } from "../health/startup.ts";
import { startHealthScheduler, type HealthSchedulerHandle } from "../health/scheduler.ts";
import { createDegradedServer, type DegradedServerHandle } from "./degraded-server.ts";
import type { WasabiConfig } from "../litestream/config.ts";

/**
 * Interface for the server created by the service
 */
export interface ServiceHandle {
  /** Get the app for Deno.serve (Hono or compatible) */
  getApp(): Hono | { fetch: (req: Request) => Response | Promise<Response> };
  /** Cleanup function called on shutdown */
  close(): void;
}

/**
 * Configuration for bootstrapping a service
 */
export interface ServiceBootstrapConfig {
  /** Service name (e.g., "crm", "bow") */
  service: string;
  /** Service version (default: "1.0.0") */
  version?: string;
  /** Port to listen on */
  port: number;
  /** Path to the database file */
  dbPath: string;
  /** Enable database health checks (default: true) */
  healthChecks?: boolean;
  /** Enable auto-repair on corruption (default: false) */
  autoRepair?: boolean;
  /**
   * Allow database recreation as last resort repair strategy (default: false).
   * WARNING: This will DELETE ALL DATA if other repair strategies fail!
   * Only enable for non-critical databases (e.g., tracking/logging).
   */
  allowRecreate?: boolean;
  /** Health check interval in ms (default: 30 minutes) */
  healthCheckIntervalMs?: number;
  /** Enable Litestream restore for missing database (default: false) */
  enableLitestream?: boolean;
  /** Environment for Litestream (production, staging, dev) */
  environment?: string;
  /** Wasabi configuration for Litestream */
  wasabi?: WasabiConfig;
  /** Factory function to create the normal server */
  createServer: () => Promise<ServiceHandle> | ServiceHandle;
  /** Optional callback before server starts */
  onBeforeStart?: (isDegraded: boolean) => Promise<void> | void;
  /** Optional callback when health issue detected at runtime */
  onHealthIssue?: (errors: string[]) => void;
  /** Optional startup banner lines */
  banner?: string[];
}

/**
 * Result from bootstrapping a service
 */
export interface BootstrapResult {
  /** Whether service is running in degraded mode */
  isDegraded: boolean;
  /** The server handle (degraded or normal) */
  server: ServiceHandle | DegradedServerHandle;
  /** Health scheduler handle (null if degraded or disabled) */
  healthScheduler: HealthSchedulerHandle | null;
  /** Trigger graceful shutdown */
  shutdown: () => void;
}

/**
 * Bootstrap a service with health checks, degraded mode support, and graceful shutdown
 *
 * This handles the common startup pattern:
 * 1. Print optional banner
 * 2. Run startup health check on database
 * 3. Start degraded server if database corrupted
 * 4. Otherwise create normal server and start health scheduler
 * 5. Register signal handlers
 * 6. Start Deno.serve()
 *
 * @example
 * ```typescript
 * import { bootstrapService, readServiceEnv } from "@p2b/db-backup";
 *
 * const env = readServiceEnv({ port: 3004, dbPath: "/app/database/crm.db" });
 *
 * await bootstrapService({
 *   service: "crm",
 *   ...env,
 *   createServer: () => {
 *     const server = new CRMServer(getCRMDatabase(env.dbPath));
 *     return {
 *       getApp: () => server.getApp(),
 *       close: () => { server.close(); closeCRMDatabase(); },
 *     };
 *   },
 * });
 * ```
 */
export async function bootstrapService(
  config: ServiceBootstrapConfig
): Promise<BootstrapResult> {
  const {
    service,
    version = "1.0.0",
    port,
    dbPath,
    healthChecks = true,
    autoRepair = false,
    allowRecreate = false,
    healthCheckIntervalMs = 30 * 60 * 1000,
    enableLitestream = false,
    environment = "dev",
    wasabi,
    createServer,
    onBeforeStart,
    onHealthIssue,
    banner,
  } = config;

  // Print banner if provided
  if (banner) {
    for (const line of banner) {
      console.log(line);
    }
  }

  console.log(`[${service}] Starting...`);
  console.log(`[${service}] Port: ${port}`);
  console.log(`[${service}] Database: ${dbPath}`);
  console.log(`[${service}] Health checks: ${healthChecks}, Auto-repair: ${autoRepair}`);
  if (enableLitestream) {
    console.log(`[${service}] Litestream: enabled (${environment})`);
  }

  // Check sqlite3 binary availability for repair strategies
  if (autoRepair) {
    try {
      const cmd = new Deno.Command("sqlite3", {
        args: ["--version"],
        stdout: "null",
        stderr: "null",
      });
      const result = await cmd.output();
      if (!result.success) {
        console.warn(`[${service}] WARNING: sqlite3 binary not working correctly - sqlite_recover strategy unavailable`);
      }
    } catch {
      console.warn(`[${service}] WARNING: sqlite3 binary not found in PATH - sqlite_recover strategy unavailable`);
    }
  }

  let isDegraded = false;
  let healthResult: StartupHealthResult | null = null;

  // Step 1: Startup health check (if enabled)
  // Also runs if Litestream is enabled (to potentially restore missing DB)
  if (healthChecks || enableLitestream) {
    try {
      const exists = await Deno.stat(dbPath).catch(() => null);

      // Run health check if DB exists, or if Litestream might restore it
      if (exists || enableLitestream) {
        healthResult = await checkStartupHealth({
          dbPath,
          service,
          autoRepair,
          allowRecreate,
          failOnCorruption: false,
          enableLitestream,
          environment,
          wasabi,
        });
        isDegraded = healthResult.degraded;

        if (healthResult.restoredFromLitestream) {
          console.log(`[${service}] Database restored from Litestream (generation: ${healthResult.litestreamGeneration || 'unknown'})`);
        }

        if (isDegraded) {
          console.error(`[${service}] Database corruption detected, unable to repair`);
          console.error(`[${service}] Errors:`, healthResult.integrityResult.errors);
        }
      }
    } catch (e) {
      console.error(`[${service}] Health check error:`, e);
    }
  }

  // Optional pre-start callback
  await onBeforeStart?.(isDegraded);

  // Step 2: Create server based on health status
  let server: ServiceHandle | DegradedServerHandle;
  let healthScheduler: HealthSchedulerHandle | null = null;

  if (isDegraded) {
    console.error(`[${service}] STARTING IN DEGRADED MODE`);
    server = createDegradedServer({ service, version });
  } else {
    // Create normal server
    server = await createServer();

    // Start health scheduler
    if (healthChecks) {
      healthScheduler = startHealthScheduler({
        dbPath,
        service,
        intervalMs: healthCheckIntervalMs,
        onIssueDetected: (result) => {
          console.error(`[${service}] Database issue detected - restart recommended`);
          console.error(`[${service}] Errors:`, result.errors);
          onHealthIssue?.(result.errors);
        },
      });
    }
  }

  console.log(`[${service}] Ready on port ${port}${isDegraded ? " (DEGRADED)" : ""}`);

  // Step 3: Create shutdown handler
  const shutdown = () => {
    console.log(`[${service}] Shutting down...`);
    healthScheduler?.stop();
    server.close();
    Deno.exit(isDegraded ? 1 : 0);
  };

  // Register signal handlers
  Deno.addSignalListener("SIGINT", shutdown);
  Deno.addSignalListener("SIGTERM", shutdown);

  // Step 4: Start server
  Deno.serve({ port }, server.getApp().fetch);

  return {
    isDegraded,
    server,
    healthScheduler,
    shutdown,
  };
}

/**
 * Environment configuration for a service
 */
export interface ServiceEnvConfig {
  /** Port to listen on */
  port: number;
  /** Database path */
  dbPath: string;
  /** Health checks enabled */
  healthChecks: boolean;
  /** Auto-repair enabled */
  autoRepair: boolean;
  /** Allow database recreation as last resort (for non-critical DBs) */
  allowRecreate: boolean;
  /** Litestream enabled */
  enableLitestream: boolean;
  /** Environment (production, staging, dev) */
  environment: string;
  /** Wasabi configuration (if Litestream enabled) */
  wasabi: WasabiConfig | undefined;
}

/**
 * Read common service configuration from environment variables
 *
 * Environment variables:
 * - PORT: Service port (default from parameter)
 * - DATABASE_PATH: Database file path (default from parameter)
 * - ENABLE_DB_HEALTH_CHECKS: Enable health checks (default: true)
 * - ENABLE_DB_AUTO_REPAIR: Enable auto-repair (default: false)
 * - ALLOW_DB_RECREATE: Allow DB recreation as last resort (default: false)
 * - ENABLE_LITESTREAM: Enable Litestream restore (default: false)
 * - ENVIRONMENT: Environment name (default: "dev")
 * - WASABI_ENDPOINT: Wasabi S3 endpoint (default: "https://s3.wasabisys.com")
 * - WASABI_REGION: Wasabi region (default: "us-east-1")
 * - WASABI_BUCKET: Wasabi bucket name
 * - WASABI_ACCESS_KEY_ID: Wasabi access key
 * - WASABI_SECRET_ACCESS_KEY: Wasabi secret key
 */
export function readServiceEnv(defaults: {
  port: number;
  dbPath: string;
}): ServiceEnvConfig {
  const enableLitestream = Deno.env.get("ENABLE_LITESTREAM") === "true";

  // Only build Wasabi config if Litestream is enabled and credentials exist
  let wasabi: WasabiConfig | undefined;
  if (enableLitestream) {
    const accessKeyId = Deno.env.get("WASABI_ACCESS_KEY_ID");
    const secretAccessKey = Deno.env.get("WASABI_SECRET_ACCESS_KEY");
    const bucket = Deno.env.get("WASABI_BUCKET");

    if (accessKeyId && secretAccessKey && bucket) {
      wasabi = {
        endpoint: Deno.env.get("WASABI_ENDPOINT") || "https://s3.wasabisys.com",
        region: Deno.env.get("WASABI_REGION") || "us-east-1",
        bucket,
        accessKeyId,
        secretAccessKey,
      };
    } else {
      console.warn("[bootstrap] ENABLE_LITESTREAM=true but Wasabi credentials missing");
    }
  }

  return {
    port: parseInt(Deno.env.get("PORT") || String(defaults.port)),
    dbPath: Deno.env.get("DATABASE_PATH") || defaults.dbPath,
    healthChecks: Deno.env.get("ENABLE_DB_HEALTH_CHECKS") !== "false",
    autoRepair: Deno.env.get("ENABLE_DB_AUTO_REPAIR") === "true",
    allowRecreate: Deno.env.get("ALLOW_DB_RECREATE") === "true",
    enableLitestream,
    environment: Deno.env.get("ENVIRONMENT") || "dev",
    wasabi,
  };
}
