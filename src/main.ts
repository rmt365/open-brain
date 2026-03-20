// Open Brain - Personal Knowledge Management Service
// Main entry point

import { bootstrapService, readServiceEnv } from "@p2b/db-backup";
import { OpenBrainServer } from "./server.ts";
import { getOpenBrainDatabase, closeOpenBrainDatabase } from "./db/openBrainDatabaseManager.ts";
import { readRawConfig } from "./config.ts";
import type { ServiceConfig } from "./config.ts";
import { createLLMProvider } from "./logic/llm/factory.ts";
import { discoverExtensions } from "./extensions/loader.ts";
import { runExtensionMigrations } from "./extensions/migrations.ts";

// Read common environment variables
const env = readServiceEnv({
  port: 3012,
  dbPath: "/app/database/open-brain.db",
});

// Read raw config from environment
const raw = readRawConfig();

// Create LLM provider
const llmProvider = createLLMProvider({
  provider: raw.llmProvider,
  anthropicApiKey: raw.anthropicApiKey,
  ollamaUrl: raw.ollamaUrl,
  defaultModel: raw.aiModel,
});

// Build service config
const config: ServiceConfig = {
  llm: {
    provider: llmProvider,
    model: raw.aiModel,
  },
  embedding: {
    ollamaUrl: raw.ollamaUrl,
    model: raw.embeddingModel,
  },
  basePath: raw.basePath,
  apiKey: raw.apiKey,
  wasabi: raw.wasabi,
};

// Log configuration
console.log(`[open-brain] LLM provider: ${raw.llmProvider}`);
console.log(`[open-brain] LLM model: ${raw.aiModel}`);
console.log(`[open-brain] Ollama URL: ${raw.ollamaUrl}`);
console.log(`[open-brain] Embedding model: ${raw.embeddingModel}`);
console.log(`[open-brain] Base path: ${raw.basePath || "(none - standalone mode)"}`);
console.log(`[open-brain] API key auth: ${raw.apiKey ? "enabled" : "disabled"}`);
console.log(`[open-brain] Document storage (Wasabi): ${raw.wasabi ? "configured" : "disabled"}`);

// Bootstrap the service with health checks and degraded mode support
await bootstrapService({
  service: "open-brain",
  version: "1.0.0",
  ...env,
  createServer: async () => {
    const dbManager = getOpenBrainDatabase(env.dbPath);
    const server = new OpenBrainServer(dbManager, config);

    // Discover and load extensions
    const extensions = await discoverExtensions({ db: dbManager, config });
    await runExtensionMigrations(dbManager.getRawDb(), extensions);
    server.registerExtensions(extensions);

    return {
      getApp: () => server.getApp(),
      close: () => {
        server.close();
        closeOpenBrainDatabase();
      },
    };
  },
});
