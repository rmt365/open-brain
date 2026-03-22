import { z } from "zod";
import { CreateCompoundTool, textResult } from "../helpers/create-compound-tool.js";
import {
  getManagedTopics,
  getPendingSuggestions,
  approveSuggestion,
  rejectSuggestion,
  gardenTopics,
} from "../helpers/open-brain-client.js";


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
    garden: {
      description: "Run the gardener: deduplicates suggestions, auto-approves frequent topics, assigns life areas, and retroactively tags thoughts. Use dry_run=true to preview.",
      handler: async (args) => {
        const dryRun = args.dry_run === true;
        const response = await gardenTopics(dryRun);

        if (!response.success || !response.data) {
          return textResult(`Garden run failed: ${response.error || "Unknown error"}`, true);
        }

        const { summary, actions } = response.data;
        const lines: string[] = [
          dryRun ? "**Garden dry run complete:**" : "**Garden run complete:**",
          "",
        ];

        if (summary.duplicates_merged > 0) lines.push(`- Duplicates merged: ${summary.duplicates_merged}`);
        if (summary.suggestions_consolidated > 0) lines.push(`- Suggestions consolidated: ${summary.suggestions_consolidated}`);
        if (summary.topics_approved > 0) lines.push(`- Topics auto-approved: ${summary.topics_approved}`);
        if (summary.life_areas_assigned > 0) lines.push(`- Life areas assigned: ${summary.life_areas_assigned}`);
        if (summary.thoughts_tagged > 0) lines.push(`- Thoughts retroactively tagged: ${summary.thoughts_tagged}`);
        if (summary.skipped_steps.length > 0) lines.push(`- Skipped: ${summary.skipped_steps.join(", ")}`);

        if (actions.length === 0) lines.push("No actions needed — everything is clean.");

        return textResult(lines.join("\n"));
      },
    },
  },
  {
    suggestion_id: z.number().optional().describe("The ID of the suggestion to approve or reject"),
    life_area: z.string().optional().describe("Life area to assign when approving"),
    include_suggestions: z.boolean().optional().default(true).describe("Include pending suggestions when listing (default: true)"),
    dry_run: z.boolean().optional().default(false).describe("Preview garden actions without making changes"),
  },
);

export default TopicsTool;
