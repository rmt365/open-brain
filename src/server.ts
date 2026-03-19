// Open Brain - HTTP Server
// Hono app with health, manifest, auth, and thought routes

import { Hono } from "@hono/hono";
import { globalErrorHandler } from "@p2b/hono-core";
import { getManifest } from "./api/manifest.ts";
import type { ServiceConfig } from "./config.ts";
import type { OpenBrainDatabaseManager } from "./db/openBrainDatabaseManager.ts";
import { createThoughtRoutes } from "./routes/thoughts.ts";
import { createPreferenceRoutes } from "./routes/preferences.ts";
import { createTopicRoutes } from "./routes/topics.ts";
import { createUIRoutes } from "./ui/routes.ts";
import { ThoughtManager } from "./logic/thoughts.ts";
import { createAuthMiddleware } from "./middleware/auth.ts";
import type { ExtensionRegistration } from "./extensions/types.ts";

// ============================================================
// OPEN BRAIN SERVER CLASS
// ============================================================

export class OpenBrainServer {
  private app: Hono;
  private dbManager: OpenBrainDatabaseManager;
  private config: ServiceConfig;
  private thoughtManager: ThoughtManager;

  constructor(dbManager: OpenBrainDatabaseManager, config: ServiceConfig) {
    this.dbManager = dbManager;
    this.config = config;
    this.thoughtManager = new ThoughtManager(dbManager, config);
    this.app = new Hono();
    this.app.onError(globalErrorHandler);
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    // Logging middleware
    this.app.use("*", async (c, next) => {
      const start = performance.now();
      await next();
      const duration = (performance.now() - start).toFixed(1);
      console.log(`${c.req.method} ${c.req.path} → ${c.res.status} (${duration}ms)`);
    });

    // CORS middleware
    this.app.use("*", async (c, next) => {
      await next();
      c.header("Access-Control-Allow-Origin", "*");
      c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    });

    // API key auth middleware
    this.app.use("*", createAuthMiddleware(this.config.apiKey));
  }

  private setupRoutes() {
    // Health endpoint
    this.app.get("/health", (c) => {
      return c.json({
        status: "healthy",
        service: "open-brain",
        timestamp: new Date().toISOString(),
      });
    });

    // Manifest endpoint
    this.app.get("/manifest", (c) => {
      return c.json(getManifest());
    });

    // Thought CRUD, search, stats, and classification routes
    this.app.route("/thoughts", createThoughtRoutes(this.thoughtManager));

    // Topic management routes (managed topics + suggestions)
    this.app.route("/topics", createTopicRoutes(this.dbManager));

    // Taste preference CRUD, block assembly, and extraction routes
    this.app.route("/preferences", createPreferenceRoutes(this.dbManager, this.config.llm));

    // UI routes (PWA chat interface)
    this.app.route("/ui", createUIRoutes(this.config.basePath));
  }

  public registerExtensions(registrations: ExtensionRegistration[]): void {
    for (const ext of registrations) {
      this.app.route(`/ext/${ext.metadata.id}`, ext.router);
      console.log(`[server] Mounted extension: /ext/${ext.metadata.id}`);
    }
  }

  public getApp() {
    return this.app;
  }

  public close() {
    // Cleanup if needed
  }
}
