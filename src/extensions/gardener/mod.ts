// Gardener extension — entry point

import type { ExtensionContext, ExtensionRegistration } from "../types.ts";
import { createGardenerRoutes } from "./routes.ts";
import { GardenAgent } from "./logic.ts";

export default function register(ctx: ExtensionContext): ExtensionRegistration {
  const agent = new GardenAgent(ctx.db, ctx.config.llm.provider);

  // Schedule full garden run daily at 3 AM
  try {
    Deno.cron("garden-daily", "0 3 * * *", async () => {
      console.log("[gardener] Starting scheduled daily garden run...");
      try {
        const result = await agent.runFull(false);
        const s = result.summary;
        console.log(
          `[gardener] Daily run complete: ${s.duplicates_merged} deduped, ` +
          `${s.topics_approved} approved, ${s.life_areas_assigned} areas assigned, ` +
          `${s.thoughts_tagged} tagged, ${s.suggestions_consolidated} consolidated`
        );
      } catch (error) {
        console.error("[gardener] Scheduled run failed:", error);
      }
    });
    console.log("[gardener] Scheduled daily garden run at 03:00 UTC");
  } catch {
    // Deno.cron requires --unstable-cron flag; skip if not available
    console.log("[gardener] Deno.cron not available — scheduled gardening disabled");
  }

  return {
    metadata: {
      id: "gardener",
      name: "Topic Gardener",
      version: "1.0.0",
      description: "Automated data quality maintenance: deduplicates topics, auto-approves, assigns life areas, and retroactively tags thoughts",
      migrationRange: "200-299",
    },
    router: createGardenerRoutes(ctx),
    migrationsDir: new URL("./migrations", import.meta.url).pathname,
  };
}
