import { z } from "zod";
import { CreateTool } from "../helpers/create-tool.js";
import { searchThoughts } from "../helpers/open-brain-client.js";

const THOUGHT_TYPES = [
  "note", "idea", "task", "question", "observation", "decision", "reference", "reflection",
] as const;

const SearchBrainTool = CreateTool(
  "search_brain",
  "Semantic search across all thoughts by meaning. Returns the most relevant thoughts " +
  "ranked by similarity to the query. Use this when you need to find thoughts about a " +
  "specific topic, concept, or question.",
  {
    query: z.string().describe("Natural language search query"),
    thought_type: z
      .enum(THOUGHT_TYPES)
      .optional()
      .describe("Filter results to a specific thought type"),
    limit: z
      .number()
      .optional()
      .default(10)
      .describe("Maximum number of results (default: 10, max: 50)"),
  },
  async ({ query, thought_type, limit }) => {
    try {
      const response = await searchThoughts(query, thought_type, limit);

      if (!response.success || !response.data) {
        return {
          content: [{
            type: "text" as const,
            text: `Search failed: ${response.error || "Unknown error"}`,
          }],
          isError: true,
        };
      }

      const results = response.data;

      if (results.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: `No thoughts found matching "${query}".`,
          }],
        };
      }

      const lines = results.map((r, i) => {
        const t = r.thought;
        const similarity = (r.similarity * 100).toFixed(1);
        const matchSource = (r as { match_source?: string }).match_source;
        const matchLabel = matchSource ? ` via ${matchSource}` : "";
        const date = new Date(t.created_at).toLocaleDateString("en-US", {
          month: "short", day: "numeric", year: "numeric",
        });
        const topic = t.topic ? ` [${t.topic}]` : "";
        const extras = [];
        if (t.auto_people && t.auto_people.length > 0) {
          extras.push(`People: ${t.auto_people.join(", ")}`);
        }
        if (t.auto_action_items && t.auto_action_items.length > 0) {
          extras.push(`Actions: ${t.auto_action_items.join("; ")}`);
        }
        const extrasStr = extras.length > 0 ? `\n   ${extras.join(" | ")}` : "";
        return `${i + 1}. [${t.thought_type}]${topic} (${similarity}%${matchLabel}, ${date})\n   ${t.text}${extrasStr}\n   ID: ${t.id}`;
      });

      const summary = `Found ${results.length} thought${results.length !== 1 ? "s" : ""} matching "${query}":`;

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
          text: `Error searching brain for "${query}": ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  },
);

export default SearchBrainTool;
