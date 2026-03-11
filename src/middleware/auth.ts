// Open Brain - API Key Authentication Middleware
// Validates Bearer token against OPEN_BRAIN_API_KEY environment variable

import type { Context, Next } from "@hono/hono";

/**
 * Create API key auth middleware.
 * If apiKey is null/empty, auth is disabled (local dev mode).
 * Skips auth for /health, /manifest, and /ui/* routes.
 */
export function createAuthMiddleware(apiKey: string | null) {
  return async (c: Context, next: Next) => {
    // No API key configured = no auth (local dev mode)
    if (!apiKey) {
      await next();
      return;
    }

    const path = c.req.path;

    // Skip auth for CORS preflight and public endpoints
    if (
      c.req.method === "OPTIONS" ||
      path === "/health" ||
      path === "/manifest" ||
      path.startsWith("/ui")
    ) {
      await next();
      return;
    }

    // Check Authorization header
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token !== apiKey) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    await next();
  };
}
