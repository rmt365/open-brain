import { z } from "zod";
import { CreateTool } from "../helpers/create-tool.js";
import { getStats } from "../helpers/open-brain-client.js";

const BrainStatsTool = CreateTool(
  "brain_stats",
  "Get aggregated statistics about the brain: total thoughts, breakdown by type " +
  "and channel, embedding coverage, and date range. Use this to understand the " +
  "overall state of the knowledge base.",
  {
    since_days: z
      .number()
      .optional()
      .default(90)
      .describe("Stats for the last N days (default: 90). Use 0 for all time."),
  },
  async ({ since_days }) => {
    try {
      const response = await getStats();

      if (!response.success || !response.data) {
        return {
          content: [{
            type: "text" as const,
            text: `Failed to get brain stats: ${response.error || "Unknown error"}`,
          }],
          isError: true,
        };
      }

      const stats = response.data;

      const parts = [
        `Brain Statistics${since_days && since_days > 0 ? ` (last ${since_days} days)` : " (all time)"}`,
        ``,
        `Total thoughts: ${stats.total_thoughts}`,
        `Embedded: ${stats.embedded_count} (${stats.total_thoughts > 0 ? ((stats.embedded_count / stats.total_thoughts) * 100).toFixed(0) : 0}%)`,
        `Classified: ${stats.classified_count} (${stats.total_thoughts > 0 ? ((stats.classified_count / stats.total_thoughts) * 100).toFixed(0) : 0}%)`,
      ];

      if (stats.oldest_thought || stats.newest_thought) {
        parts.push(``);
        parts.push(`Date range:`);
        if (stats.oldest_thought) {
          const oldest = new Date(stats.oldest_thought).toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric",
          });
          parts.push(`  Oldest: ${oldest}`);
        }
        if (stats.newest_thought) {
          const newest = new Date(stats.newest_thought).toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric",
          });
          parts.push(`  Newest: ${newest}`);
        }
      }

      const typeEntries = Object.entries(stats.by_type).filter(([, count]) => count > 0);
      if (typeEntries.length > 0) {
        parts.push(``);
        parts.push(`By type:`);
        typeEntries
          .sort(([, a], [, b]) => b - a)
          .forEach(([type, count]) => {
            parts.push(`  ${type}: ${count}`);
          });
      }

      const channelEntries = Object.entries(stats.by_channel).filter(([, count]) => count > 0);
      if (channelEntries.length > 0) {
        parts.push(``);
        parts.push(`By channel:`);
        channelEntries
          .sort(([, a], [, b]) => b - a)
          .forEach(([channel, count]) => {
            parts.push(`  ${channel}: ${count}`);
          });
      }

      return {
        content: [{
          type: "text" as const,
          text: parts.join("\n"),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error getting brain stats: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  },
);

export default BrainStatsTool;
