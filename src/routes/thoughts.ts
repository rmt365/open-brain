// Open Brain - Thought Routes
// HTTP routes for thought capture, search, CRUD, and stats

import { Hono } from "@hono/hono";
import { validateJson } from "@p2b/hono-core";
import {
  CaptureThoughtSchema,
  UpdateThoughtSchema,
  SearchThoughtsSchema,
  IngestUrlSchema,
  QueryBrainSchema,
} from "../schemas/schemas.ts";
import type { ThoughtManager } from "../logic/thoughts.ts";
import type {
  Thought,
  SearchResult,
  BrainStats,
  ListResponse,
  ApiResponse,
  ThoughtType,
  LifeArea,
  SourceChannel,
  ThoughtStatus,
} from "../types/index.ts";

/**
 * Create thought routes.
 * Returns a Hono router to be mounted at /thoughts on the main app.
 */
export function createThoughtRoutes(manager: ThoughtManager): Hono {
  const router = new Hono();

  // ============================================================
  // STATIC ROUTES (must be defined BEFORE :id to avoid capture)
  // ============================================================

  // GET /stats — brain statistics
  router.get("/stats", (c) => {
    try {
      const stats = manager.getStats();

      return c.json<ApiResponse<BrainStats>>({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("[OpenBrain:Routes] Error getting stats:", error);
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  // GET /topics — topic list with counts
  router.get("/topics", (c) => {
    try {
      const topics = manager.getTopics();

      return c.json<ApiResponse<Array<{ topic: string; count: number }>>>({
        success: true,
        data: topics,
      });
    } catch (error) {
      console.error("[OpenBrain:Routes] Error getting topics:", error);
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  // POST /ingest — ingest a URL: fetch, extract, chunk, embed
  router.post(
    "/ingest",
    validateJson(IngestUrlSchema),
    async (c) => {
      try {
        const body = c.req.valid("json");
        const thought = await manager.ingestUrl(body.url, body.life_area);

        if (!thought) {
          return c.json<ApiResponse>(
            { success: false, error: "Failed to extract content from URL" },
            422,
          );
        }

        return c.json<ApiResponse<Thought>>(
          {
            success: true,
            data: thought,
            message: "URL ingested",
          },
          201,
        );
      } catch (error) {
        console.error("[OpenBrain:Routes] Error ingesting URL:", error);
        const msg = error instanceof Error ? error.message : String(error);
        return c.json<ApiResponse>({ success: false, error: msg }, 500);
      }
    },
  );

  // GET /forgotten — surface forgotten thoughts
  router.get("/forgotten", (c) => {
    try {
      const minAgeDays = parseInt(c.req.query("min_age_days") || "30");
      const limit = parseInt(c.req.query("limit") || "5");
      const lifeArea = c.req.query("life_area") as LifeArea | undefined;

      const thoughts = manager.surfaceForgotten({
        minAgeDays: isNaN(minAgeDays) ? 30 : minAgeDays,
        limit: isNaN(limit) ? 5 : Math.min(Math.max(limit, 1), 20),
        lifeArea: lifeArea || undefined,
      });

      return c.json<ApiResponse<Thought[]>>({
        success: true,
        data: thoughts,
        message: thoughts.length > 0
          ? `${thoughts.length} forgotten thought${thoughts.length !== 1 ? "s" : ""} surfaced`
          : "No forgotten thoughts to surface right now",
      });
    } catch (error) {
      console.error("[OpenBrain:Routes] Error surfacing forgotten thoughts:", error);
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  // POST /reclassify-all — batch reclassify thoughts missing life area
  router.post("/reclassify-all", async (c) => {
    try {
      const limit = parseInt(c.req.query("limit") || "50");
      const result = await manager.processMissingLifeArea(
        isNaN(limit) ? 50 : Math.min(Math.max(limit, 1), 200)
      );

      return c.json<ApiResponse<{ processed: number; failed: number }>>({
        success: true,
        data: result,
        message: `Reclassified ${result.processed} thoughts (${result.failed} failed)`,
      });
    } catch (error) {
      console.error("[OpenBrain:Routes] Error batch reclassifying:", error);
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  // POST /query — ask a question against the brain (RAG)
  router.post(
    "/query",
    validateJson(QueryBrainSchema),
    async (c) => {
      try {
        const body = c.req.valid("json");
        const answer = await manager.queryBrain(body.question);

        return c.json<ApiResponse<{ answer: string }>>({
          success: true,
          data: { answer },
        });
      } catch (error) {
        console.error("[OpenBrain:Routes] Error querying brain:", error);
        const msg = error instanceof Error ? error.message : String(error);
        return c.json<ApiResponse>({ success: false, error: msg }, 500);
      }
    },
  );

  // POST /search — semantic search
  router.post(
    "/search",
    validateJson(SearchThoughtsSchema),
    async (c) => {
      try {
        const body = c.req.valid("json");
        const results = await manager.search(
          body.query,
          body.thought_type,
          body.limit,
        );

        return c.json<ApiResponse<SearchResult[]>>({
          success: true,
          data: results,
        });
      } catch (error) {
        console.error("[OpenBrain:Routes] Error searching thoughts:", error);
        const msg = error instanceof Error ? error.message : String(error);
        return c.json<ApiResponse>({ success: false, error: msg }, 500);
      }
    },
  );

  // ============================================================
  // COLLECTION ROUTES
  // ============================================================

  // POST / — capture a new thought
  router.post(
    "/",
    validateJson(CaptureThoughtSchema),
    async (c) => {
      try {
        const body = c.req.valid("json");
        const thought = await manager.capture(
          body.text,
          body.source_channel,
          body.metadata,
          body.thought_type,
          body.topic,
          body.life_area,
        );

        return c.json<ApiResponse<Thought>>(
          {
            success: true,
            data: thought,
            message: "Thought captured",
          },
          201,
        );
      } catch (error) {
        console.error("[OpenBrain:Routes] Error capturing thought:", error);
        const msg = error instanceof Error ? error.message : String(error);
        return c.json<ApiResponse>({ success: false, error: msg }, 500);
      }
    },
  );

  // GET / — list thoughts (paginated, filterable)
  router.get("/", (c) => {
    try {
      const thought_type = c.req.query("type") as ThoughtType | undefined;
      const topic = c.req.query("topic");
      const life_area = c.req.query("life_area") as LifeArea | undefined;
      const source_channel = c.req.query("channel") as SourceChannel | undefined;
      const since = c.req.query("since");
      const status = c.req.query("status") as ThoughtStatus | undefined;
      const limit = parseInt(c.req.query("limit") || "50");
      const offset = parseInt(c.req.query("offset") || "0");

      const result = manager.list({
        thought_type: thought_type || undefined,
        topic: topic || undefined,
        life_area: life_area || undefined,
        source_channel: source_channel || undefined,
        since: since || undefined,
        status: status || undefined,
        limit: isNaN(limit) ? 50 : Math.min(Math.max(limit, 1), 100),
        offset: isNaN(offset) ? 0 : Math.max(offset, 0),
      });

      return c.json<ApiResponse<ListResponse<Thought>>>({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("[OpenBrain:Routes] Error listing thoughts:", error);
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  // ============================================================
  // SINGLE-RESOURCE ROUTES (after static routes)
  // ============================================================

  // GET /:id — get a single thought
  router.get("/:id", (c) => {
    try {
      const id = c.req.param("id");
      const thought = manager.get(id);

      if (!thought) {
        return c.json<ApiResponse>(
          { success: false, error: "Thought not found" },
          404,
        );
      }

      return c.json<ApiResponse<Thought>>({
        success: true,
        data: thought,
      });
    } catch (error) {
      console.error("[OpenBrain:Routes] Error getting thought:", error);
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  // PUT /:id — update a thought
  router.put(
    "/:id",
    validateJson(UpdateThoughtSchema),
    (c) => {
      try {
        const id = c.req.param("id");
        const body = c.req.valid("json");

        const thought = manager.update(id, body);

        if (!thought) {
          return c.json<ApiResponse>(
            { success: false, error: "Thought not found" },
            404,
          );
        }

        return c.json<ApiResponse<Thought>>({
          success: true,
          data: thought,
          message: "Thought updated",
        });
      } catch (error) {
        console.error("[OpenBrain:Routes] Error updating thought:", error);
        const msg = error instanceof Error ? error.message : String(error);
        return c.json<ApiResponse>({ success: false, error: msg }, 500);
      }
    },
  );

  // DELETE /:id — soft-delete a thought
  router.delete("/:id", (c) => {
    try {
      const id = c.req.param("id");
      const deleted = manager.delete(id);

      if (!deleted) {
        return c.json<ApiResponse>(
          { success: false, error: "Thought not found or already deleted" },
          404,
        );
      }

      return c.json<ApiResponse>({
        success: true,
        message: "Thought deleted",
      });
    } catch (error) {
      console.error("[OpenBrain:Routes] Error deleting thought:", error);
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  // POST /:id/reclassify — re-run AI classification
  router.post("/:id/reclassify", async (c) => {
    try {
      const id = c.req.param("id");
      const thought = await manager.reclassify(id);

      if (!thought) {
        return c.json<ApiResponse>(
          { success: false, error: "Thought not found" },
          404,
        );
      }

      return c.json<ApiResponse<Thought>>({
        success: true,
        data: thought,
        message: "Thought reclassified",
      });
    } catch (error) {
      console.error("[OpenBrain:Routes] Error reclassifying thought:", error);
      const msg = error instanceof Error ? error.message : String(error);
      return c.json<ApiResponse>({ success: false, error: msg }, 500);
    }
  });

  return router;
}
