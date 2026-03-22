// Gardener extension — REST API routes

import { Hono } from "@hono/hono";
import type { ExtensionContext } from "../types.ts";
import { GardenAgent } from "./logic.ts";

export function createGardenerRoutes(ctx: ExtensionContext): Hono {
  const router = new Hono();
  const agent = new GardenAgent(ctx.db, ctx.config.llm.provider);

  // POST /ext/gardener/run — full garden run
  // Query param ?dry_run=true for preview
  router.post("/run", async (c) => {
    const dryRun = c.req.query("dry_run") === "true";
    const result = await agent.runFull(dryRun);
    return c.json({ success: true, data: result });
  });

  // GET /ext/gardener/log — action history
  // Query param ?limit=50
  router.get("/log", (c) => {
    const limit = parseInt(c.req.query("limit") || "50", 10);
    const entries = ctx.db.getGardenLog(limit);
    return c.json({ success: true, data: entries, total: entries.length });
  });

  // GET /ext/gardener/status — current state
  router.get("/status", (c) => {
    const pendingSuggestions = ctx.db.getPendingSuggestions();
    const lastRun = ctx.db.getLastGardenRun();

    return c.json({
      success: true,
      data: {
        pending_suggestion_count: pendingSuggestions.length,
        last_run: lastRun,
      },
    });
  });

  return router;
}
