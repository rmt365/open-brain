// Open Brain - API Key Management Routes
// CRUD routes for managing API keys (admin scope required)

import { Hono } from "@hono/hono";
import { validateJson } from "@p2b/hono-core";
import {
  CreateApiKeySchema,
  UpdateApiKeySchema,
  type CreateApiKeyInput,
  type UpdateApiKeyInput,
} from "../schemas/schemas.ts";
import type { OpenBrainDatabaseManager } from "../db/openBrainDatabaseManager.ts";
import type { ApiKey, ApiKeyCreated, ApiResponse } from "../types/index.ts";
import { requireScope } from "../middleware/require-scope.ts";
import { clearApiKeyCache } from "../middleware/auth.ts";

export function createApiKeyRoutes(db: OpenBrainDatabaseManager): Hono {
  const router = new Hono();

  // All routes require admin scope
  router.use("*", requireScope("admin"));

  /** POST / — Create a new API key (returns raw key once) */
  router.post("/", validateJson(CreateApiKeySchema), async (c) => {
    try {
      const data = c.req.valid("json" as never) as CreateApiKeyInput;
      const { apiKey, rawKey } = await db.createApiKey(data);
      clearApiKeyCache();

      const created: ApiKeyCreated = { ...apiKey, raw_key: rawKey };
      return c.json<ApiResponse<ApiKeyCreated>>({
        success: true,
        data: created,
        message: "API key created. Save the raw_key now — it will not be shown again.",
      }, 201);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  /** GET / — List all API keys (never exposes hashes) */
  router.get("/", (c) => {
    try {
      const keys = db.listApiKeys();
      return c.json<ApiResponse<ApiKey[]>>({
        success: true,
        data: keys,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  /** GET /:id — Get single key details */
  router.get("/:id", (c) => {
    try {
      const id = c.req.param("id");
      const key = db.getApiKey(id);
      if (!key) {
        return c.json<ApiResponse>({ success: false, error: "API key not found" }, 404);
      }
      return c.json<ApiResponse<ApiKey>>({
        success: true,
        data: key,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  /** PUT /:id — Update key name, scopes, or enabled status */
  router.put("/:id", validateJson(UpdateApiKeySchema), (c) => {
    try {
      const id = c.req.param("id");
      const data = c.req.valid("json" as never) as UpdateApiKeyInput;
      const key = db.updateApiKey(id, data);
      if (!key) {
        return c.json<ApiResponse>({ success: false, error: "API key not found" }, 404);
      }
      clearApiKeyCache();
      return c.json<ApiResponse<ApiKey>>({
        success: true,
        data: key,
        message: "API key updated",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  /** DELETE /:id — Delete a key */
  router.delete("/:id", (c) => {
    try {
      const id = c.req.param("id");
      const deleted = db.deleteApiKey(id);
      if (!deleted) {
        return c.json<ApiResponse>({ success: false, error: "API key not found" }, 404);
      }
      clearApiKeyCache();
      return c.json<ApiResponse>({
        success: true,
        message: "API key deleted",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  return router;
}
