// Gardener extension — entry point

import type { ExtensionContext, ExtensionRegistration } from "../types.ts";
import { createGardenerRoutes } from "./routes.ts";

export default function register(ctx: ExtensionContext): ExtensionRegistration {
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
