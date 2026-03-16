import { z } from "zod";
import { CreateTool } from "../helpers/create-tool.js";
import {
  createPreference,
  listPreferences,
  deletePreference,
} from "../helpers/open-brain-client.js";

export const AddPreferenceTool = CreateTool(
  "add_preference",
  "Record a user preference or decision as a guardrail for future work. " +
  "Use this when the user expresses a clear preference, makes a decision, or " +
  "states a rule about how they want things done. Captures both what they want " +
  "and what they reject. These preferences are automatically available as context " +
  "to all connected AI agents.",
  {
    preference_name: z.string().describe("Short name for the preference (e.g., 'Code style', 'Writing tone')"),
    domain: z.string().optional().describe("Category domain (e.g., 'writing', 'code', 'strategy', 'design'). Defaults to 'general'."),
    reject: z.string().describe("What the user does NOT want (e.g., 'Flowery language, passive voice')"),
    want: z.string().describe("What the user DOES want (e.g., 'Direct, concise prose with active voice')"),
    constraint_type: z
      .enum(["domain rule", "quality standard", "business logic", "formatting"])
      .optional()
      .describe("Type of constraint. Defaults to 'quality standard'."),
  },
  async ({ preference_name, domain, reject, want, constraint_type }) => {
    try {
      const response = await createPreference({
        preference_name,
        domain,
        reject,
        want,
        constraint_type,
      });

      if (!response.success || !response.data) {
        return {
          content: [{
            type: "text" as const,
            text: `Failed to save preference: ${response.error || "Unknown error"}`,
          }],
          isError: true,
        };
      }

      const p = response.data;
      return {
        content: [{
          type: "text" as const,
          text: `Preference saved: "${p.preference_name}" (${p.domain})\n` +
            `  Reject: ${p.reject}\n` +
            `  Want: ${p.want}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error saving preference: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  },
);

export const ListPreferencesTool = CreateTool(
  "list_preferences",
  "List all recorded user preferences, optionally filtered by domain. " +
  "Shows the full details of each preference including what the user wants and rejects.",
  {
    domain: z.string().optional().describe("Filter by domain (e.g., 'writing', 'code')"),
  },
  async ({ domain }) => {
    try {
      const response = await listPreferences(domain);

      if (!response.success || !response.data) {
        return {
          content: [{
            type: "text" as const,
            text: `Failed to list preferences: ${response.error || "Unknown error"}`,
          }],
          isError: true,
        };
      }

      const prefs = response.data;
      if (prefs.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: domain
              ? `No preferences found for domain "${domain}".`
              : "No preferences recorded yet.",
          }],
        };
      }

      const lines = prefs.map((p) =>
        `[${p.id}] ${p.preference_name} (${p.domain})\n` +
        `  Reject: ${p.reject}\n` +
        `  Want: ${p.want}\n` +
        `  Type: ${p.constraint_type}`
      );

      return {
        content: [{
          type: "text" as const,
          text: `${prefs.length} preference(s)${domain ? ` in "${domain}"` : ""}:\n\n${lines.join("\n\n")}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error listing preferences: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  },
);

export const RemovePreferenceTool = CreateTool(
  "remove_preference",
  "Remove a recorded preference by its ID. Use list_preferences first to find the ID.",
  {
    id: z.number().describe("The preference ID to remove"),
  },
  async ({ id }) => {
    try {
      const response = await deletePreference(id);

      if (!response.success) {
        return {
          content: [{
            type: "text" as const,
            text: `Failed to remove preference: ${response.error || "Not found"}`,
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: `Preference ${id} removed.`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error removing preference: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  },
);
