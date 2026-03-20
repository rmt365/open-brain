import { z } from "zod";
import { CreateCompoundTool, textResult } from "../helpers/create-compound-tool.js";
import {
  getManagedTopics,
  getPendingSuggestions,
  approveSuggestion,
  rejectSuggestion,
} from "../helpers/open-brain-client.js";

const LIFE_AREAS = [
  "craft", "business", "systems", "health", "marriage", "relationships", "creative", "wild", "meta",
] as const;

const TopicsTool = CreateCompoundTool(
  "topics",
  "Manage the brain's topic taxonomy — list managed topics, approve or reject pending suggestions.",
  {
    list: {
      description: "List managed topics grouped by life area, with pending suggestions",
      handler: async (args) => {
        const includeSuggestions = args.include_suggestions !== false;

        const [topicsResponse, suggestionsResponse] = await Promise.all([
          getManagedTopics(),
          includeSuggestions ? getPendingSuggestions() : Promise.resolve(null),
        ]);

        if (!topicsResponse.success || !topicsResponse.data) {
          return textResult(`Failed to list topics: ${topicsResponse.error || "Unknown error"}`, true);
        }

        const topics = topicsResponse.data;
        if (topics.length === 0) {
          return textResult("No managed topics found.");
        }

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

        if (suggestionsResponse?.success && suggestionsResponse.data) {
          const suggestions = suggestionsResponse.data;
          if (suggestions.length > 0) {
            lines.push("");
            lines.push(`**${suggestions.length} pending suggestion${suggestions.length !== 1 ? "s" : ""}:**`);
            for (const s of suggestions) {
              lines.push(`  - "${s.name}" (id: ${s.id})`);
            }
          }
        }

        return textResult(lines.join("\n"));
      },
    },
    approve: {
      description: "Approve a pending topic suggestion (requires suggestion_id)",
      required: ["suggestion_id"],
      handler: async (args) => {
        const response = await approveSuggestion(
          args.suggestion_id as number,
          args.life_area as string | undefined,
        );

        if (!response.success || !response.data) {
          return textResult(`Failed to approve suggestion: ${response.error || "Unknown error"}`, true);
        }

        const topic = response.data;
        const areaStr = topic.life_area ? ` (area: ${topic.life_area})` : "";
        return textResult(`Topic "${topic.name}" approved and added to managed topics${areaStr}.`);
      },
    },
    reject: {
      description: "Reject a pending topic suggestion (requires suggestion_id)",
      required: ["suggestion_id"],
      handler: async (args) => {
        const response = await rejectSuggestion(args.suggestion_id as number);

        if (!response.success) {
          return textResult(`Failed to reject suggestion: ${response.error || "Unknown error"}`, true);
        }

        return textResult("Suggestion rejected.");
      },
    },
  },
  {
    suggestion_id: z.number().optional().describe("The ID of the suggestion to approve or reject"),
    life_area: z.enum(LIFE_AREAS).optional().describe("Life area to assign when approving"),
    include_suggestions: z.boolean().optional().default(true).describe("Include pending suggestions when listing (default: true)"),
  },
);

export default TopicsTool;
