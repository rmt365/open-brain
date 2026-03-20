// Extension auto-discovery
// Scans src/extensions/*/mod.ts for extension register functions

import { join } from "@std/path";
import { existsSync } from "std/fs";
import type { ExtensionContext, ExtensionRegistration } from "./types.ts";

export async function discoverExtensions(
  ctx: ExtensionContext,
): Promise<ExtensionRegistration[]> {
  const extensionsDir = new URL(".", import.meta.url).pathname;
  const registrations: ExtensionRegistration[] = [];

  for (const entry of Deno.readDirSync(extensionsDir)) {
    if (!entry.isDirectory) continue;
    const modPath = join(extensionsDir, entry.name, "mod.ts");
    if (!existsSync(modPath)) continue;

    try {
      const mod = await import(`file://${modPath}`);
      if (typeof mod.default !== "function") {
        console.warn(`[extensions] ${entry.name}/mod.ts does not export a default function, skipping`);
        continue;
      }

      const registration = mod.default(ctx) as ExtensionRegistration;
      registrations.push(registration);
      console.log(`[extensions] Discovered: ${registration.metadata.name} v${registration.metadata.version}`);
    } catch (error) {
      console.error(`[extensions] Failed to load ${entry.name}:`, error);
    }
  }

  return registrations;
}
