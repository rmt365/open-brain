/**
 * Generic degraded server factory
 * Creates a minimal HTTP server for services running in degraded mode
 */

import { Hono } from "@hono/hono";

export interface DegradedServerConfig {
  /** Service name (e.g., "crm", "bow") */
  service: string;
  /** Optional service version (default: "1.0.0") */
  version?: string;
  /** Reason for degraded mode (default: "database_corruption") */
  reason?: string;
  /** Custom message for error responses */
  message?: string;
}

export interface DegradedServerHandle {
  /** Get the Hono app instance for Deno.serve */
  getApp(): Hono;
  /** Close the server (no-op for degraded mode) */
  close(): void;
}

/**
 * Create a degraded mode server that returns 503 for most routes
 *
 * Only /health and /manifest endpoints are functional:
 * - /health returns 503 with degraded status
 * - /manifest returns empty tools list with degraded status
 * - All other routes return 503 Service Unavailable
 */
export function createDegradedServer(
  config: DegradedServerConfig | string
): DegradedServerHandle {
  const service = typeof config === "string" ? config : config.service;
  const version = typeof config === "object" ? config.version ?? "1.0.0" : "1.0.0";
  const reason = typeof config === "object" ? config.reason ?? "database_corruption" : "database_corruption";
  const customMessage = typeof config === "object" ? config.message : undefined;

  const app = new Hono();

  // Health endpoint returns 503 with degraded status
  app.get("/health", (c) =>
    c.json(
      {
        status: "degraded",
        service,
        reason,
        message: "Service running in degraded mode. Database repair required.",
        timestamp: new Date().toISOString(),
      },
      503
    )
  );

  // Manifest endpoint still works for service discovery
  app.get("/manifest", (c) =>
    c.json({
      service,
      version,
      status: "degraded",
      tools: [],
    })
  );

  // All other routes return 503
  app.all("*", (c) =>
    c.json(
      {
        error: "Service Unavailable",
        reason,
        message: customMessage ?? `${service} is in degraded mode due to ${reason.replace(/_/g, " ")}.`,
      },
      503
    )
  );

  return {
    getApp: () => app,
    close: () => {
      // No-op for degraded mode - nothing to clean up
    },
  };
}
