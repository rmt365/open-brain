// Open Brain - Topic Management Routes
// HTTP routes for managed topics and topic suggestions

import { Hono } from "@hono/hono";
import { validateJson } from "@p2b/hono-core";
import { CreateManagedTopicSchema } from "../schemas/schemas.ts";
import type { OpenBrainDatabaseManager } from "../db/openBrainDatabaseManager.ts";
import type {
  ManagedTopic,
  SuggestedTopic,
  LifeArea,
  ApiResponse,
} from "../types/index.ts";

/**
 * Create topic management routes.
 * Returns a Hono router to be mounted at /topics on the main app.
 */
export function createTopicRoutes(db: OpenBrainDatabaseManager): Hono {
  const router = new Hono();

  // ============================================================
  // STATIC ROUTES (must come before :id)
  // ============================================================

  /** GET /topics/suggestions — list pending topic suggestions */
  router.get("/suggestions", (c) => {
    try {
      const suggestions = db.getPendingSuggestions();
      return c.json<ApiResponse<SuggestedTopic[]>>({
        success: true,
        data: suggestions,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  /** POST /topics/suggestions/:id/approve — approve a suggestion */
  router.post("/suggestions/:id/approve", (c) => {
    try {
      const id = parseInt(c.req.param("id"));
      if (isNaN(id)) {
        return c.json<ApiResponse>({ success: false, error: "Invalid suggestion ID" }, 400);
      }

      const lifeAreaParam = c.req.query("life_area") as LifeArea | undefined;
      const topic = db.approveSuggestion(id, lifeAreaParam);

      if (!topic) {
        return c.json<ApiResponse>(
          { success: false, error: "Suggestion not found or already processed" },
          404,
        );
      }

      return c.json<ApiResponse<ManagedTopic>>({
        success: true,
        data: topic,
        message: `Topic "${topic.name}" approved and added`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  /** POST /topics/suggestions/:id/reject — reject a suggestion */
  router.post("/suggestions/:id/reject", (c) => {
    try {
      const id = parseInt(c.req.param("id"));
      if (isNaN(id)) {
        return c.json<ApiResponse>({ success: false, error: "Invalid suggestion ID" }, 400);
      }

      const rejected = db.rejectSuggestion(id);

      if (!rejected) {
        return c.json<ApiResponse>(
          { success: false, error: "Suggestion not found or already processed" },
          404,
        );
      }

      return c.json<ApiResponse>({
        success: true,
        message: "Suggestion rejected",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  // ============================================================
  // COLLECTION ROUTES
  // ============================================================

  /** GET /topics — list managed topics */
  router.get("/", (c) => {
    try {
      const includeInactive = c.req.query("include_inactive") === "true";
      const topics = db.getManagedTopics(!includeInactive);

      return c.json<ApiResponse<ManagedTopic[]>>({
        success: true,
        data: topics,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  /** POST /topics — add a managed topic manually */
  router.post("/", validateJson(CreateManagedTopicSchema), (c) => {
    try {
      const data = c.req.valid("json" as never);
      const topic = db.addManagedTopic(data.name, data.life_area);

      return c.json<ApiResponse<ManagedTopic>>({
        success: true,
        data: topic,
        message: `Topic "${topic.name}" created`,
      }, 201);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("UNIQUE constraint")) {
        return c.json<ApiResponse>({ success: false, error: "Topic already exists" }, 409);
      }
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  // ============================================================
  // SINGLE RESOURCE ROUTES
  // ============================================================

  /** DELETE /topics/:id — deactivate a managed topic */
  router.delete("/:id", (c) => {
    try {
      const id = parseInt(c.req.param("id"));
      if (isNaN(id)) {
        return c.json<ApiResponse>({ success: false, error: "Invalid topic ID" }, 400);
      }

      const deactivated = db.deactivateManagedTopic(id);

      if (!deactivated) {
        return c.json<ApiResponse>(
          { success: false, error: "Topic not found" },
          404,
        );
      }

      return c.json<ApiResponse>({
        success: true,
        message: "Topic deactivated",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  return router;
}
