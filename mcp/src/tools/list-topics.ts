import { z } from "zod";
import { CreateTool } from "../helpers/create-tool.js";
import { getTopics } from "../helpers/open-brain-client.js";

const ListTopicsTool = CreateTool(
  "list_topics",
  "List topics with thought counts, ordered by frequency. Use this to understand " +
  "what subjects the brain contains and how much content exists for each topic.",
  {
    limit: z
      .number()
      .optional()
      .default(20)
      .describe("Maximum number of topics to return (default: 20)"),
    min_count: z
      .number()
      .optional()
      .default(1)
      .describe("Minimum number of thoughts a topic must have (default: 1)"),
  },
  async ({ limit, min_count }) => {
    try {
      const response = await getTopics(limit ?? 20, min_count ?? 1);

      if (!response.success || !response.data) {
        return {
          content: [{
            type: "text" as const,
            text: `Failed to list topics: ${response.error || "Unknown error"}`,
          }],
          isError: true,
        };
      }

      const topics = response.data;

      if (topics.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: `No topics found${(min_count ?? 1) > 1 ? ` with at least ${min_count} thoughts` : ""}.`,
          }],
        };
      }

      const lines = topics.map((t, i) => {
        const bar = "\u2588".repeat(Math.min(t.count, 20));
        return `${i + 1}. ${t.topic} (${t.count} thought${t.count !== 1 ? "s" : ""}) ${bar}`;
      });

      const totalThoughts = topics.reduce((sum, t) => sum + t.count, 0);
      const summary = `${topics.length} topic${topics.length !== 1 ? "s" : ""} covering ${totalThoughts} thought${totalThoughts !== 1 ? "s" : ""}:`;

      return {
        content: [{
          type: "text" as const,
          text: `${summary}\n\n${lines.join("\n")}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error listing topics: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  },
);

export default ListTopicsTool;
