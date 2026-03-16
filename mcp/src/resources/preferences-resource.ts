import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getPreferencesBlock } from "../helpers/open-brain-client.js";

/**
 * Register the preferences resource.
 * This surfaces the user's preference block as context automatically
 * when an MCP client connects, without requiring a tool call.
 */
export function registerPreferencesResource(server: McpServer) {
  server.resource(
    "preferences",
    "open-brain://preferences",
    {
      description:
        "User's taste preferences and decision records. " +
        "These are guardrails the user has defined — quality standards, domain rules, " +
        "and constraints that should inform all generated content. " +
        "Read this before producing creative work, writing, or making recommendations.",
      mimeType: "text/plain",
    },
    async () => {
      try {
        const response = await getPreferencesBlock();

        if (!response.success || !response.data?.block) {
          return {
            contents: [{
              uri: "open-brain://preferences",
              text: "No preferences defined yet.",
              mimeType: "text/plain",
            }],
          };
        }

        return {
          contents: [{
            uri: "open-brain://preferences",
            text: response.data.block,
            mimeType: "text/plain",
          }],
        };
      } catch (error) {
        return {
          contents: [{
            uri: "open-brain://preferences",
            text: `Error loading preferences: ${error instanceof Error ? error.message : String(error)}`,
            mimeType: "text/plain",
          }],
        };
      }
    },
  );
}
