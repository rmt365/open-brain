// Open Brain - HTTP Server
// Hono app with health, manifest, auth, and thought routes

import { Hono } from "@hono/hono";
import { globalErrorHandler } from "@p2b/hono-core";
import { getManifest } from "./api/manifest.ts";
import type { ServiceConfig } from "./config.ts";
import type { OpenBrainDatabaseManager } from "./db/openBrainDatabaseManager.ts";
import { createThoughtRoutes } from "./routes/thoughts.ts";
import { createPreferenceRoutes } from "./routes/preferences.ts";
import { createConfigRoutes } from "./routes/config.ts";
import { createTopicRoutes } from "./routes/topics.ts";
import { createLifeAreaRoutes } from "./routes/life-areas.ts";
import { createDocumentRoutes } from "./routes/documents.ts";
import { createUIRoutes } from "./ui/routes.ts";
import { ThoughtManager } from "./logic/thoughts.ts";
import { createAuthMiddleware } from "./middleware/auth.ts";
import { requireScope } from "./middleware/require-scope.ts";
import { createApiKeyRoutes } from "./routes/api-keys.ts";
import type { ExtensionRegistration } from "./extensions/types.ts";
import { getBackupHealth } from "./logic/backup-health.ts";

// ============================================================
// OPEN BRAIN SERVER CLASS
// ============================================================

export class OpenBrainServer {
  private app: Hono;
  private dbManager: OpenBrainDatabaseManager;
  private config: ServiceConfig;
  private thoughtManager: ThoughtManager;

  constructor(dbManager: OpenBrainDatabaseManager, config: ServiceConfig, thoughtManager?: ThoughtManager) {
    this.dbManager = dbManager;
    this.config = config;
    this.thoughtManager = thoughtManager ?? new ThoughtManager(dbManager, config);
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

    // API key auth middleware (master key + DB-managed keys)
    this.app.use("*", createAuthMiddleware(this.config.apiKey, this.dbManager));

    // Global scope gating: read for GET/HEAD, write for mutations
    this.app.use("*", async (c, next) => {
      // deno-lint-ignore no-explicit-any
      const scopes = (c as any).get("authScopes") as string[] | undefined;
      if (!scopes) {
        // Auth was skipped (public route)
        await next();
        return;
      }
      const method = c.req.method;
      if (method === "GET" || method === "HEAD") {
        if (!scopes.includes("read")) {
          return c.json({ error: "Forbidden: read scope required" }, 403);
        }
      } else if (method !== "OPTIONS") {
        if (!scopes.includes("write")) {
          return c.json({ error: "Forbidden: write scope required" }, 403);
        }
      }
      await next();
    });
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

    // Backup health endpoint
    this.app.get("/health/backup", async (c) => {
      const status = await getBackupHealth(
        this.config.enableLitestream,
        this.config.databasePath,
      );
      return c.json(status);
    });

    // Manifest endpoint
    this.app.get("/manifest", (c) => {
      return c.json(getManifest());
    });

    // Thought CRUD, search, stats, and classification routes
    this.app.route("/thoughts", createThoughtRoutes(this.thoughtManager));

    // Topic management routes (managed topics + suggestions)
    this.app.route("/topics", createTopicRoutes(this.dbManager));

    // Life area management routes
    this.app.route("/life-areas", createLifeAreaRoutes(this.dbManager));

    // Document upload (image/PDF extraction via Claude vision)
    this.app.route("/documents", createDocumentRoutes(this.thoughtManager, this.config));

    // Preference (rule) CRUD, block assembly, and extraction routes
    this.app.route("/preferences", createPreferenceRoutes(this.dbManager, this.config.llm));

    // Config artifact CRUD, upsert, profiles, and purpose search routes
    this.app.route("/config", createConfigRoutes(this.dbManager));

    // API key management routes (admin scope enforced inside)
    this.app.route("/api-keys", createApiKeyRoutes(this.dbManager));

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
