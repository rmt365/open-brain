// Open Brain - Scope Authorization Middleware
// Checks that the authenticated key has the required scope(s)

import type { Context, Next } from "@hono/hono";
import type { ApiKeyScope } from "../types/index.ts";

// deno-lint-ignore no-explicit-any
type AnyContext = any;

/**
 * Require at least one of the given scopes.
 * Must be used after auth middleware (which sets authScopes on context).
 */
export function requireScope(...requiredScopes: ApiKeyScope[]) {
  return async (c: Context, next: Next) => {
    const ctx = c as AnyContext;
    const authScopes: ApiKeyScope[] = ctx.get("authScopes") || [];
    const hasScope = requiredScopes.some((s) => authScopes.includes(s));
    if (!hasScope) {
      return c.json({ error: "Forbidden: insufficient scope" }, 403);
    }
    await next();
  };
}
