import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getStats } from "../helpers/open-brain-client.js";

/**
 * Register the brain stats resource.
 * Replaces the brain_stats tool — stats are informational context,
 * not an action, so they belong as a resource.
 */
export function registerStatsResource(server: McpServer) {
  server.resource(
    "stats",
    "open-brain://stats",
    {
      description:
        "Brain statistics — total thoughts, breakdown by type and channel, " +
        "embedding/classification coverage, and date range.",
      mimeType: "text/plain",
    },
    async () => {
      try {
        const response = await getStats();

        if (!response.success || !response.data) {
          return {
            contents: [{
              uri: "open-brain://stats",
              text: "Unable to load brain stats.",
              mimeType: "text/plain",
            }],
          };
        }

        const stats = response.data;

        const parts = [
          `Brain Statistics (all time)`,
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
          contents: [{
            uri: "open-brain://stats",
            text: parts.join("\n"),
            mimeType: "text/plain",
          }],
        };
      } catch (error) {
        return {
          contents: [{
            uri: "open-brain://stats",
            text: `Error loading stats: ${error instanceof Error ? error.message : String(error)}`,
            mimeType: "text/plain",
          }],
        };
      }
    },
  );
}
