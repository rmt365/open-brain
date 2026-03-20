import { z } from "zod";
import { CreateTool } from "../helpers/create-tool.js";
import { uploadDocument } from "../helpers/open-brain-client.js";

const IngestDocumentTool = CreateTool(
  "ingest_document",
  "Upload an image or PDF document for OCR extraction — extracts structured data " +
  "(vendor, amount, date, line items, etc.) using Claude vision, stores the original " +
  "in cloud storage, and saves the extracted text as a searchable reference thought.",
  {
    file_data: z.string().describe("Base64-encoded file data"),
    filename: z.string().describe("Original filename (e.g. 'receipt.jpg', 'warranty.pdf')"),
    mime_type: z
      .enum(["image/jpeg", "image/png", "image/webp", "application/pdf"])
      .describe("MIME type of the file"),
    life_area: z
      .enum(["craft", "business", "systems", "health", "marriage", "relationships", "creative", "wild", "meta"])
      .optional()
      .describe("Life area to assign (optional — will be auto-classified if not provided)"),
    context: z
      .string()
      .optional()
      .describe("Additional context about the document (optional)"),
  },
  async ({ file_data, filename, mime_type, life_area, context }) => {
    try {
      const response = await uploadDocument(file_data, filename, mime_type, life_area, context);

      if (!response.success || !response.data) {
        return {
          content: [{
            type: "text" as const,
            text: `Failed to process document: ${response.error || "Unknown error"}`,
          }],
          isError: true,
        };
      }

      const d = response.data;
      const ext = d.extraction;
      const parts = [`Document processed successfully.`, ``];

      if (ext) {
        parts.push(`Title: ${ext.title}`);
        parts.push(`Type: ${ext.document_type}`);
        if (ext.vendor) parts.push(`Vendor: ${ext.vendor}`);
        if (ext.total_amount) parts.push(`Amount: ${ext.total_amount}`);
        if (ext.date) parts.push(`Date: ${ext.date}`);
      }

      parts.push(`Thought ID: ${d.thought_id}`);
      if (d.wasabi_key) parts.push(`Stored: ${d.wasabi_key}`);
      parts.push(`\nThe extracted text has been embedded for semantic search.`);

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
          text: `Error processing document "${filename}": ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  },
);

export default IngestDocumentTool;
