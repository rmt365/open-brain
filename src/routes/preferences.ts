// Open Brain - Preference Routes
// HTTP routes for taste preference CRUD, block assembly, and natural language extraction

import { Hono } from "@hono/hono";
import { validateJson } from "@p2b/hono-core";
import {
  CreatePreferenceSchema,
  UpdatePreferenceSchema,
  ExtractPreferenceSchema,
  type CreatePreferenceInput,
  type UpdatePreferenceInput,
  type ExtractPreferenceInput,
} from "../schemas/schemas.ts";
import type { OpenBrainDatabaseManager } from "../db/openBrainDatabaseManager.ts";
import type {
  TastePreference,
  ApiResponse,
  ConstraintType,
} from "../types/index.ts";
import type { LLMProvider } from "../logic/llm/types.ts";
import { extractPreference } from "../logic/preferences.ts";

interface LLMConfig {
  provider: LLMProvider;
  model: string;
}

/**
 * Create preference routes.
 * Returns a Hono router to be mounted at /preferences on the main app.
 */
export function createPreferenceRoutes(db: OpenBrainDatabaseManager, llmConfig?: LLMConfig): Hono {
  const router = new Hono();

  // ============================================================
  // STATIC ROUTES (must come before :id)
  // ============================================================

  /** GET /preferences/domains — List distinct domains with counts */
  router.get("/domains", (c) => {
    try {
      const domains = db.listDomains();
      return c.json<ApiResponse<Array<{ domain: string; count: number }>>>({
        success: true,
        data: domains,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  /** GET /preferences/block — Assembled preferences as a system prompt block */
  router.get("/block", (c) => {
    try {
      const domain = c.req.query("domain");
      const block = db.assemblePreferencesBlock(domain);
      return c.json<ApiResponse<{ block: string }>>({
        success: true,
        data: { block },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  /** POST /preferences/extract — Extract a preference from natural language */
  router.post("/extract", validateJson(ExtractPreferenceSchema), async (c) => {
    if (!llmConfig) {
      return c.json<ApiResponse>({ success: false, error: "LLM not configured" }, 503);
    }

    try {
      const { text } = c.req.valid("json" as never) as ExtractPreferenceInput;
      const extracted = await extractPreference(text, llmConfig.provider, llmConfig.model);

      if (!extracted) {
        return c.json<ApiResponse>({
          success: false,
          error: "Could not extract a preference from that text. Try being more specific about what you want and don't want.",
        }, 422);
      }

      // Save the extracted preference
      const preference = db.createPreference(extracted);
      return c.json<ApiResponse<TastePreference>>({
        success: true,
        data: preference,
        message: "Preference extracted and saved",
      }, 201);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  // ============================================================
  // COLLECTION ROUTES
  // ============================================================

  /** POST /preferences — Create a new preference */
  router.post("/", validateJson(CreatePreferenceSchema), (c) => {
    try {
      const data = c.req.valid("json" as never) as CreatePreferenceInput;
      const preference = db.createPreference(data);
      return c.json<ApiResponse<TastePreference>>({
        success: true,
        data: preference,
        message: "Preference created",
      }, 201);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  /** GET /preferences — List preferences with optional filters */
  router.get("/", (c) => {
    try {
      const domain = c.req.query("domain");
      const constraintType = c.req.query("constraint_type") as ConstraintType | undefined;
      const preferences = db.listPreferences(domain, constraintType);
      return c.json<ApiResponse<TastePreference[]>>({
        success: true,
        data: preferences,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  // ============================================================
  // SINGLE RESOURCE ROUTES
  // ============================================================

  /** GET /preferences/:id — Get a single preference */
  router.get("/:id", (c) => {
    try {
      const id = c.req.param("id");
      const preference = db.getPreference(id);
      if (!preference) {
        return c.json<ApiResponse>({ success: false, error: "Preference not found" }, 404);
      }
      return c.json<ApiResponse<TastePreference>>({
        success: true,
        data: preference,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  /** PUT /preferences/:id — Update a preference */
  router.put("/:id", validateJson(UpdatePreferenceSchema), (c) => {
    try {
      const id = c.req.param("id");
      const data = c.req.valid("json" as never) as UpdatePreferenceInput;
      const preference = db.updatePreference(id, data);
      if (!preference) {
        return c.json<ApiResponse>({ success: false, error: "Preference not found" }, 404);
      }
      return c.json<ApiResponse<TastePreference>>({
        success: true,
        data: preference,
        message: "Preference updated",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  /** DELETE /preferences/:id — Delete a preference */
  router.delete("/:id", (c) => {
    try {
      const id = c.req.param("id");
      const deleted = db.deletePreference(id);
      if (!deleted) {
        return c.json<ApiResponse>({ success: false, error: "Preference not found" }, 404);
      }
      return c.json<ApiResponse>({
        success: true,
        message: "Preference deleted",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  return router;
}
