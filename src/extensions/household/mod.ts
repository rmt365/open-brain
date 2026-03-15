// Household Knowledge extension — entry point

import type { ExtensionContext, ExtensionRegistration } from "../types.ts";
import { createHouseholdRoutes } from "./routes.ts";

export default function register(ctx: ExtensionContext): ExtensionRegistration {
  return {
    metadata: {
      id: "household",
      name: "Household Knowledge",
      version: "1.0.0",
      description: "Track household items, paint colors, appliances, and service providers",
      migrationRange: "100-199",
    },
    router: createHouseholdRoutes(ctx),
    migrationsDir: new URL("./migrations", import.meta.url).pathname,
  };
}
