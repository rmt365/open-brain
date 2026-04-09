// Extension framework types
// Each extension lives in src/extensions/<name>/ and exports a register function from mod.ts

import type { Hono } from "@hono/hono";
import type { OpenBrainDatabaseManager } from "../db/openBrainDatabaseManager.ts";
import type { ServiceConfig } from "../config.ts";
import type { ThoughtManager } from "../logic/thoughts.ts";

export interface ExtensionMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  migrationRange: string;
}

export interface ExtensionContext {
  db: OpenBrainDatabaseManager;
  config: ServiceConfig;
  thoughtManager: ThoughtManager;
}

export interface ExtensionRegistration {
  metadata: ExtensionMetadata;
  router: Hono;
  migrationsDir?: string;
}

export type ExtensionRegisterFn = (ctx: ExtensionContext) => ExtensionRegistration;
