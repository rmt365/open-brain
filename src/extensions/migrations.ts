// Extension migration runner
// Runs each extension's migrations using the shared MigrationManager

import type { Database } from "jsr:@db/sqlite@0.12";
import { MigrationManager } from "@p2b/db-core";
import type { ExtensionRegistration } from "./types.ts";

export async function runExtensionMigrations(
  db: Database,
  registrations: ExtensionRegistration[],
): Promise<void> {
  for (const ext of registrations) {
    if (!ext.migrationsDir) continue;
    console.log(`[extensions] Running migrations for ${ext.metadata.name} from ${ext.migrationsDir}`);
    const mgr = new MigrationManager(db, ext.migrationsDir);
    await mgr.runMigrations();
  }
}
