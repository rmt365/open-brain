// Open Brain - API Key Authentication Middleware
// Supports master key (env var) and DB-managed keys with scopes

import type { Context, Next } from "@hono/hono";
import type { OpenBrainDatabaseManager } from "../db/openBrainDatabaseManager.ts";
import { hashApiKey } from "../db/openBrainDatabaseManager.ts";
import type { ApiKey, ApiKeyScope } from "../types/index.ts";

// deno-lint-ignore no-explicit-any
type AnyContext = any;

// In-memory cache for DB key lookups (avoids hashing + DB query per request)
const keyCache = new Map<string, { key: ApiKey; cachedAt: number }>();
const CACHE_TTL_MS = 60_000;

// Tracks last_used_at updates to throttle DB writes
const lastUsedTracker = new Map<string, number>();
const LAST_USED_THROTTLE_MS = 60_000;

/** Clear the API key cache (call after key mutations) */
export function clearApiKeyCache(): void {
  keyCache.clear();
  lastUsedTracker.clear();
}

/**
 * Create API key auth middleware.
 * If masterKey is null/empty, auth is disabled (local dev mode).
 * Checks master key first (fast path), then DB-managed keys.
 */
export function createAuthMiddleware(
  masterKey: string | null,
  db: OpenBrainDatabaseManager | null,
) {
  return async (c: Context, next: Next) => {
    const ctx = c as AnyContext;

    // No API key configured = no auth (local dev mode)
    if (!masterKey) {
      ctx.set("authScopes", ["read", "write", "admin"] as ApiKeyScope[]);
      ctx.set("isMasterKey", true);
      await next();
      return;
    }

    const path = c.req.path;

    // Skip auth for CORS preflight and public endpoints
    if (
      c.req.method === "OPTIONS" ||
      path.startsWith("/health") ||
      path === "/manifest" ||
      path.startsWith("/ui") ||
      (c.req.method === "GET" && path.startsWith("/documents/"))
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

    // Fast path: master key check (simple string comparison, no hashing)
    if (token === masterKey) {
      ctx.set("authScopes", ["read", "write", "admin"] as ApiKeyScope[]);
      ctx.set("isMasterKey", true);
      await next();
      return;
    }

    // DB path: hash the token and look up in cache/DB
    if (db) {
      const hash = await hashApiKey(token);

      // Check cache first
      const cached = keyCache.get(hash);
      if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
        ctx.set("authScopes", cached.key.scopes);
        ctx.set("isMasterKey", false);
        throttledTouchLastUsed(db, hash);
        await next();
        return;
      }

      // Cache miss: query DB
      const apiKey = db.getApiKeyByHash(hash);
      if (apiKey) {
        keyCache.set(hash, { key: apiKey, cachedAt: Date.now() });
        ctx.set("authScopes", apiKey.scopes);
        ctx.set("isMasterKey", false);
        throttledTouchLastUsed(db, hash);
        await next();
        return;
      }
    }

    return c.json({ error: "Unauthorized" }, 401);
  };
}

/** Update last_used_at at most once per LAST_USED_THROTTLE_MS per key */
function throttledTouchLastUsed(db: OpenBrainDatabaseManager, keyHash: string): void {
  const now = Date.now();
  const lastTouched = lastUsedTracker.get(keyHash) || 0;
  if (now - lastTouched > LAST_USED_THROTTLE_MS) {
    lastUsedTracker.set(keyHash, now);
    try {
      db.touchApiKeyLastUsed(keyHash);
    } catch {
      // Non-critical — don't fail the request
    }
  }
}
