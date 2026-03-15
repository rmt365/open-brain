import { z } from "zod";
import { CreateTool } from "../helpers/create-tool.js";
import { ingestUrl } from "../helpers/open-brain-client.js";

const IngestUrlTool = CreateTool(
  "ingest_url",
  "Save a URL for later — fetches the page content, extracts the text, chunks it " +
  "for semantic search, and stores it as a reference thought. Use this when the user " +
  "wants to bookmark an article, save a link, or remember a web page.",
  {
    url: z.string().url().describe("The URL to ingest"),
    life_area: z
      .enum(["craft", "business", "systems", "health", "marriage", "relationships", "creative", "wild", "meta"])
      .optional()
      .describe("Life area to assign (optional — will be auto-classified if not provided)"),
  },
  async ({ url, life_area }) => {
    try {
      const response = await ingestUrl(url, life_area);

      if (!response.success || !response.data) {
        return {
          content: [{
            type: "text" as const,
            text: `Failed to ingest URL: ${response.error || "Could not extract content from the page"}`,
          }],
          isError: true,
        };
      }

      const t = response.data;
      const parts = [
        `URL ingested successfully.`,
        ``,
        `Title: ${t.metadata?.title || "Unknown"}`,
        `Type: ${t.thought_type}`,
      ];

      if (t.auto_life_area) {
        parts.push(`Life area: ${t.auto_life_area}`);
      }

      if (t.auto_topics && t.auto_topics.length > 0) {
        parts.push(`Topics: ${t.auto_topics.join(", ")}`);
      }

      parts.push(`ID: ${t.id}`);
      parts.push(`\nThe content has been chunked and embedded for semantic search.`);

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
          text: `Error ingesting URL: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  },
);

export default IngestUrlTool;
