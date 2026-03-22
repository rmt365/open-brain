// Open Brain - Life Area Management Routes
// HTTP routes for configurable life areas

import { Hono } from "@hono/hono";
import type { OpenBrainDatabaseManager } from "../db/openBrainDatabaseManager.ts";
import type {
  LifeAreaConfig,
  ApiResponse,
} from "../types/index.ts";

/**
 * Create life area management routes.
 * Returns a Hono router to be mounted at /life-areas on the main app.
 */
export function createLifeAreaRoutes(db: OpenBrainDatabaseManager): Hono {
  const router = new Hono();

  // ============================================================
  // STATIC ROUTES (must come before :id)
  // ============================================================

  /** PUT /life-areas/reorder — batch reorder life areas */
  router.put("/reorder", async (c) => {
    try {
      const body = await c.req.json() as { ids: number[] };
      if (!Array.isArray(body.ids) || body.ids.length === 0) {
        return c.json<ApiResponse>(
          { success: false, error: "ids array is required" },
          400,
        );
      }

      db.reorderLifeAreas(body.ids);

      return c.json<ApiResponse>({
        success: true,
        message: "Life areas reordered",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  // ============================================================
  // COLLECTION ROUTES
  // ============================================================

  /** GET /life-areas — list active life areas (or all with ?include_archived=true) */
  router.get("/", (c) => {
    try {
      const includeArchived = c.req.query("include_archived") === "true";
      const areas = db.getLifeAreas(!includeArchived);

      return c.json<ApiResponse<LifeAreaConfig[]>>({
        success: true,
        data: areas,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  /** POST /life-areas — add a new life area */
  router.post("/", async (c) => {
    try {
      const body = await c.req.json() as {
        name: string;
        label: string;
        description?: string;
        color: string;
      };

      if (!body.name || !body.label || !body.color) {
        return c.json<ApiResponse>(
          { success: false, error: "name, label, and color are required" },
          400,
        );
      }

      const area = db.addLifeArea(body);

      return c.json<ApiResponse<LifeAreaConfig>>({
        success: true,
        data: area,
        message: `Life area "${area.name}" created`,
      }, 201);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("UNIQUE constraint")) {
        return c.json<ApiResponse>({ success: false, error: "Life area already exists" }, 409);
      }
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  // ============================================================
  // SINGLE RESOURCE ROUTES
  // ============================================================

  /** PUT /life-areas/:id — update a life area */
  router.put("/:id", async (c) => {
    try {
      const id = parseInt(c.req.param("id"));
      if (isNaN(id)) {
        return c.json<ApiResponse>({ success: false, error: "Invalid life area ID" }, 400);
      }

      const body = await c.req.json() as {
        label?: string;
        description?: string;
        color?: string;
      };

      const area = db.updateLifeArea(id, body);
      if (!area) {
        return c.json<ApiResponse>(
          { success: false, error: "Life area not found" },
          404,
        );
      }

      return c.json<ApiResponse<LifeAreaConfig>>({
        success: true,
        data: area,
        message: `Life area "${area.name}" updated`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  /** DELETE /life-areas/:id — archive (soft delete) a life area */
  router.delete("/:id", (c) => {
    try {
      const id = parseInt(c.req.param("id"));
      if (isNaN(id)) {
        return c.json<ApiResponse>({ success: false, error: "Invalid life area ID" }, 400);
      }

      const archived = db.archiveLifeArea(id);
      if (!archived) {
        return c.json<ApiResponse>(
          { success: false, error: "Life area not found" },
          404,
        );
      }

      return c.json<ApiResponse>({
        success: true,
        message: "Life area archived",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  return router;
}
