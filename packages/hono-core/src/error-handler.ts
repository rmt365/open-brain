import type { Context } from "@hono/hono";

/**
 * Global error handler for Hono apps.
 * Returns consistent JSON error responses for unhandled errors.
 *
 * Usage:
 *   import { globalErrorHandler } from "@p2b/hono-core";
 *   app.onError(globalErrorHandler);
 */
export function globalErrorHandler(err: Error, c: Context) {
  console.error("Unhandled error:", err);

  return c.json(
    {
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    },
    500
  );
}
