// Open Brain - Config Artifact Routes
// HTTP routes for config artifact CRUD, upsert, profiles, and purpose search

import { Hono } from "@hono/hono";
import { validateJson } from "@p2b/hono-core";
import {
  CreateConfigArtifactSchema,
  UpdateConfigArtifactSchema,
  type CreateConfigArtifactInput,
  type UpdateConfigArtifactInput,
} from "../schemas/schemas.ts";
import type { OpenBrainDatabaseManager } from "../db/openBrainDatabaseManager.ts";
import type {
  ConfigArtifact,
  ApiResponse,
  ArtifactType,
} from "../types/index.ts";

/**
 * Create config artifact routes.
 * Returns a Hono router to be mounted at /config on the main app.
 */
export function createConfigRoutes(db: OpenBrainDatabaseManager): Hono {
  const router = new Hono();

  // ============================================================
  // STATIC ROUTES (must come before :id)
  // ============================================================

  /** GET /config/profiles — List config profiles (domains with config artifacts) */
  router.get("/profiles", (c) => {
    try {
      const profiles = db.listConfigProfiles();
      return c.json<ApiResponse>({
        success: true,
        data: profiles,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  /** GET /config/by-purpose — Find artifacts with matching purpose across domains */
  router.get("/by-purpose", (c) => {
    try {
      const purpose = c.req.query("purpose");
      if (!purpose) {
        return c.json<ApiResponse>({ success: false, error: "purpose query param required" }, 400);
      }
      const domainsParam = c.req.query("domains");
      const domains = domainsParam ? domainsParam.split(",").map((d) => d.trim()) : undefined;
      const results = db.findByPurpose(purpose, domains);
      return c.json<ApiResponse<ConfigArtifact[]>>({
        success: true,
        data: results,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  /** PUT /config/upsert — Upsert a config artifact by domain + name */
  router.put("/upsert", validateJson(CreateConfigArtifactSchema), (c) => {
    try {
      const data = c.req.valid("json" as never) as CreateConfigArtifactInput;
      const artifact = db.upsertConfigArtifact(data.domain, data.name, {
        content: data.content,
        artifact_type: data.artifact_type,
        purpose: data.purpose,
        constraint_type: data.constraint_type,
      });
      return c.json<ApiResponse<ConfigArtifact>>({
        success: true,
        data: artifact,
        message: "Config artifact upserted",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  // ============================================================
  // COLLECTION ROUTES
  // ============================================================

  /** POST /config — Create a config artifact */
  router.post("/", validateJson(CreateConfigArtifactSchema), (c) => {
    try {
      const data = c.req.valid("json" as never) as CreateConfigArtifactInput;
      const artifact = db.createConfigArtifact(data);
      return c.json<ApiResponse<ConfigArtifact>>({
        success: true,
        data: artifact,
        message: "Config artifact created",
      }, 201);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  /** GET /config — List config artifacts with optional filters */
  router.get("/", (c) => {
    try {
      const domain = c.req.query("domain");
      const artifactType = c.req.query("artifact_type") as ArtifactType | undefined;
      const artifacts = db.listConfigArtifacts(domain, artifactType);
      return c.json<ApiResponse<ConfigArtifact[]>>({
        success: true,
        data: artifacts,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  // ============================================================
  // SINGLE RESOURCE ROUTES
  // ============================================================

  /** GET /config/:id — Get a single config artifact */
  router.get("/:id", (c) => {
    try {
      const id = c.req.param("id");
      const artifact = db.getConfigArtifact(id);
      if (!artifact) {
        return c.json<ApiResponse>({ success: false, error: "Config artifact not found" }, 404);
      }
      return c.json<ApiResponse<ConfigArtifact>>({
        success: true,
        data: artifact,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  /** PUT /config/:id — Update a config artifact */
  router.put("/:id", validateJson(UpdateConfigArtifactSchema), (c) => {
    try {
      const id = c.req.param("id");
      const data = c.req.valid("json" as never) as UpdateConfigArtifactInput;
      const artifact = db.updateConfigArtifact(id, data);
      if (!artifact) {
        return c.json<ApiResponse>({ success: false, error: "Config artifact not found" }, 404);
      }
      return c.json<ApiResponse<ConfigArtifact>>({
        success: true,
        data: artifact,
        message: "Config artifact updated",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  /** DELETE /config/:id — Delete a config artifact */
  router.delete("/:id", (c) => {
    try {
      const id = c.req.param("id");
      const deleted = db.deleteConfigArtifact(id);
      if (!deleted) {
        return c.json<ApiResponse>({ success: false, error: "Config artifact not found" }, 404);
      }
      return c.json<ApiResponse>({
        success: true,
        message: "Config artifact deleted",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  return router;
}
