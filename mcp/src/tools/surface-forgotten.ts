import { z } from "zod";
import { CreateTool } from "../helpers/create-tool.js";
import { getForgottenThoughts } from "../helpers/open-brain-client.js";

const SurfaceForgottenTool = CreateTool(
  "surface_forgotten",
  "Surface old thoughts you may have forgotten about. Returns thoughts that " +
  "haven't been revisited in a while, prioritizing the oldest unseen ones. " +
  "Use this for reflection, review, or when looking for inspiration.",
  {
    min_age_days: z
      .number()
      .optional()
      .default(30)
      .describe("Minimum age in days for a thought to be considered forgotten (default: 30)"),
    limit: z
      .number()
      .optional()
      .default(5)
      .describe("Number of thoughts to surface (default: 5, max: 20)"),
    life_area: z
      .enum(["craft", "business", "systems", "health", "marriage", "relationships", "creative", "wild", "meta"])
      .optional()
      .describe("Filter by life area (optional)"),
  },
  async ({ min_age_days, limit, life_area }) => {
    try {
      const response = await getForgottenThoughts(min_age_days, limit, life_area);

      if (!response.success || !response.data) {
        return {
          content: [{
            type: "text" as const,
            text: `Failed to surface thoughts: ${response.error || "Unknown error"}`,
          }],
          isError: true,
        };
      }

      const thoughts = response.data;

      if (thoughts.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: "No forgotten thoughts to surface right now. Either everything is recent, or you've already reviewed everything.",
          }],
        };
      }

      const lines = [`${thoughts.length} forgotten thought${thoughts.length !== 1 ? "s" : ""} surfaced:\n`];

      for (const t of thoughts) {
        const age = Math.floor(
          (Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24)
        );
        const area = t.life_area || t.auto_life_area || "unclassified";
        const preview = t.text.length > 150 ? t.text.substring(0, 150) + "..." : t.text;

        lines.push(`---`);
        lines.push(`**[${area}]** ${preview}`);
        lines.push(`Type: ${t.thought_type} | ${age} days ago | ID: ${t.id}`);
      }

      lines.push(`\nThese thoughts have been marked as surfaced and won't appear again for at least 7 days.`);

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
          text: `Error surfacing thoughts: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  },
);

export default SurfaceForgottenTool;
