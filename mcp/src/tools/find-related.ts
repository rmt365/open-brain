import { z } from "zod";
import { CreateTool } from "../helpers/create-tool.js";
import { getThought, searchThoughts } from "../helpers/open-brain-client.js";

const FindRelatedTool = CreateTool(
  "find_related",
  "Find thoughts related to a given thought by semantic similarity. Retrieves the " +
  "specified thought and searches for others with similar meaning. Use this to " +
  "discover connections between ideas.",
  {
    thought_id: z.string().describe("The ID of the thought to find related thoughts for"),
    limit: z
      .number()
      .optional()
      .default(5)
      .describe("Maximum number of related thoughts to return (default: 5)"),
  },
  async ({ thought_id, limit }) => {
    try {
      // First, get the source thought
      const thoughtResponse = await getThought(thought_id);

      if (!thoughtResponse.success || !thoughtResponse.data) {
        return {
          content: [{
            type: "text" as const,
            text: `Thought not found: ${thoughtResponse.error || "Unknown error"}`,
          }],
          isError: true,
        };
      }

      const sourceThought = thoughtResponse.data;

      // Search using the thought's text to find similar ones
      const effectiveLimit = (limit ?? 5) + 1; // +1 because the source thought may appear in results
      const searchResponse = await searchThoughts(sourceThought.text, undefined, effectiveLimit);

      if (!searchResponse.success || !searchResponse.data) {
        return {
          content: [{
            type: "text" as const,
            text: `Search failed: ${searchResponse.error || "Unknown error"}`,
          }],
          isError: true,
        };
      }

      // Filter out the source thought itself
      const related = searchResponse.data
        .filter((r) => r.thought.id !== thought_id)
        .slice(0, limit ?? 5);

      const sourceTopic = sourceThought.topic ? ` [${sourceThought.topic}]` : "";
      const sourceDate = new Date(sourceThought.created_at).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      });

      const header = `Source: [${sourceThought.thought_type}]${sourceTopic} ${sourceDate}\n  "${sourceThought.text}"`;

      if (related.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: `${header}\n\nNo related thoughts found.`,
          }],
        };
      }

      const lines = related.map((r, i) => {
        const t = r.thought;
        const similarity = (r.similarity * 100).toFixed(1);
        const date = new Date(t.created_at).toLocaleDateString("en-US", {
          month: "short", day: "numeric", year: "numeric",
        });
        const topic = t.topic ? ` [${t.topic}]` : "";
        return `${i + 1}. [${t.thought_type}]${topic} (${similarity}% similar, ${date})\n   ${t.text}\n   ID: ${t.id}`;
      });

      return {
        content: [{
          type: "text" as const,
          text: `${header}\n\nFound ${related.length} related thought${related.length !== 1 ? "s" : ""}:\n\n${lines.join("\n\n")}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error finding related thoughts: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  },
);

export default FindRelatedTool;
