import { z } from "zod";
import { CreateTool } from "../helpers/create-tool.js";
import { getManagedTopics, getPendingSuggestions } from "../helpers/open-brain-client.js";

const ListTopicsTool = CreateTool(
  "list_topics",
  "List managed topics grouped by life area. Also shows pending topic suggestions " +
  "that need approval. Use this to understand the brain's taxonomy.",
  {
    include_suggestions: z
      .boolean()
      .optional()
      .default(true)
      .describe("Include pending topic suggestions (default: true)"),
  },
  async ({ include_suggestions }) => {
    try {
      const [topicsResponse, suggestionsResponse] = await Promise.all([
        getManagedTopics(),
        include_suggestions ? getPendingSuggestions() : Promise.resolve(null),
      ]);

      if (!topicsResponse.success || !topicsResponse.data) {
        return {
          content: [{
            type: "text" as const,
            text: `Failed to list topics: ${topicsResponse.error || "Unknown error"}`,
          }],
          isError: true,
        };
      }

      const topics = topicsResponse.data;

      if (topics.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: "No managed topics found.",
          }],
        };
      }

      // Group by life area
      const byArea = new Map<string, string[]>();
      for (const topic of topics) {
        const area = topic.life_area || "unassigned";
        if (!byArea.has(area)) byArea.set(area, []);
        byArea.get(area)!.push(topic.name);
      }

      const lines: string[] = [`${topics.length} managed topics:\n`];

      for (const [area, names] of byArea) {
        lines.push(`**${area}**: ${names.join(", ")}`);
      }

      // Add pending suggestions
      if (suggestionsResponse && suggestionsResponse.success && suggestionsResponse.data) {
        const suggestions = suggestionsResponse.data;
        if (suggestions.length > 0) {
          lines.push("");
          lines.push(`**${suggestions.length} pending suggestion${suggestions.length !== 1 ? "s" : ""}:**`);
          for (const s of suggestions) {
            lines.push(`  - "${s.name}" (id: ${s.id})`);
          }
        }
      }

      return {
        content: [{
          type: "text" as const,
          text: lines.join("\n"),
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
