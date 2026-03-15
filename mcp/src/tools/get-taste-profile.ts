import { z } from "zod";
import { CreateTool } from "../helpers/create-tool.js";
import { getPreferencesBlock } from "../helpers/open-brain-client.js";

const GetTasteProfileTool = CreateTool(
  "get_taste_profile",
  "Get the user's taste preferences formatted as a system prompt block. " +
  "Returns all quality standards, domain rules, and constraints the user " +
  "has defined. Use this to understand the user's preferences before " +
  "generating content.",
  {
    domain: z
      .string()
      .optional()
      .describe("Filter by domain (e.g., 'writing', 'code', 'strategy')"),
  },
  async ({ domain }) => {
    try {
      const response = await getPreferencesBlock(domain);

      if (!response.success || !response.data) {
        return {
          content: [{
            type: "text" as const,
            text: `Failed to get taste profile: ${response.error || "Unknown error"}`,
          }],
          isError: true,
        };
      }

      const block = response.data.block;

      if (!block) {
        return {
          content: [{
            type: "text" as const,
            text: domain
              ? `No taste preferences found for domain "${domain}".`
              : "No taste preferences defined yet.",
          }],
        };
      }

      const header = domain
        ? `Taste Preferences (${domain}):`
        : "Taste Preferences:";

      return {
        content: [{
          type: "text" as const,
          text: `${header}\n\n${block}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error getting taste profile: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  },
);

export default GetTasteProfileTool;
