import { z } from "zod";
import { CreateTool } from "../helpers/create-tool.js";
import { listThoughts } from "../helpers/open-brain-client.js";

const THOUGHT_TYPES = [
  "note", "idea", "task", "question", "observation", "decision", "reference", "reflection",
] as const;

const BrowseRecentTool = CreateTool(
  "browse_recent",
  "Browse recent thoughts chronologically with optional filters. Use this to see " +
  "what has been captured recently, or to browse thoughts by type or topic.",
  {
    thought_type: z
      .enum(THOUGHT_TYPES)
      .optional()
      .describe("Filter to a specific thought type"),
    topic: z
      .string()
      .optional()
      .describe("Filter by topic"),
    since_days: z
      .number()
      .optional()
      .default(7)
      .describe("Show thoughts from the last N days (default: 7)"),
    limit: z
      .number()
      .optional()
      .default(20)
      .describe("Maximum number of results (default: 20, max: 50)"),
  },
  async ({ thought_type, topic, since_days, limit }) => {
    try {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - (since_days ?? 7));
      const since = sinceDate.toISOString();

      const response = await listThoughts({
        thought_type,
        topic,
        since,
        limit: limit ?? 20,
      });

      if (!response.success || !response.data) {
        return {
          content: [{
            type: "text" as const,
            text: `Failed to browse thoughts: ${response.error || "Unknown error"}`,
          }],
          isError: true,
        };
      }

      const { items, total } = response.data;

      if (items.length === 0) {
        const filters = [];
        if (thought_type) filters.push(`type=${thought_type}`);
        if (topic) filters.push(`topic="${topic}"`);
        filters.push(`last ${since_days ?? 7} days`);
        return {
          content: [{
            type: "text" as const,
            text: `No thoughts found (${filters.join(", ")}).`,
          }],
        };
      }

      const lines = items.map((t, i) => {
        const date = new Date(t.created_at).toLocaleDateString("en-US", {
          month: "short", day: "numeric", year: "numeric",
          hour: "numeric", minute: "2-digit", hour12: true,
        } as Intl.DateTimeFormatOptions);
        const topicLabel = t.topic ? ` [${t.topic}]` : "";
        return `${i + 1}. [${t.thought_type}]${topicLabel} ${date}\n   ${t.text}\n   ID: ${t.id}`;
      });

      const filterDesc = [];
      if (thought_type) filterDesc.push(`type: ${thought_type}`);
      if (topic) filterDesc.push(`topic: "${topic}"`);
      filterDesc.push(`last ${since_days ?? 7} days`);

      const summary = `Showing ${items.length} of ${total} thoughts (${filterDesc.join(", ")}):`;

      return {
        content: [{
          type: "text" as const,
          text: `${summary}\n\n${lines.join("\n\n")}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error browsing thoughts: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  },
);

export default BrowseRecentTool;
