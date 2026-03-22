import { z } from "zod";
import { CreateCompoundTool, textResult } from "../helpers/create-compound-tool.js";
import {
  captureThought,
  ingestUrl,
  uploadDocument,
  createPreference,
  createBlock,
  deletePreference,
} from "../helpers/open-brain-client.js";

const LIFE_AREAS = [
  "craft", "business", "systems", "health", "marriage", "relationships", "creative", "wild", "meta",
] as const;

const MIME_TYPES = [
  "image/jpeg", "image/png", "image/webp", "application/pdf",
] as const;

const CONSTRAINT_TYPES = [
  "domain rule", "quality standard", "business logic", "formatting",
] as const;

const CaptureTool = CreateCompoundTool(
  "capture",
  "Capture knowledge into the brain — thoughts, URLs, documents, or preferences.",
  {
    thought: {
      description: "Capture a thought, note, idea, question, or observation (requires text)",
      required: ["text"],
      handler: async (args) => {
        const response = await captureThought(args.text as string);

        if (!response.success || !response.data) {
          return textResult(`Failed to capture thought: ${response.error || "Unknown error"}`, true);
        }

        const t = response.data;
        const date = new Date(t.created_at).toLocaleDateString("en-US", {
          month: "short", day: "numeric", year: "numeric",
        });

        const parts = [`Thought captured successfully.`, ``];
        parts.push(`Type: ${t.thought_type}`);

        if (t.auto_type && t.auto_type !== t.thought_type) {
          parts.push(`Auto-classified as: ${t.auto_type} (confidence: ${((t.confidence || 0) * 100).toFixed(0)}%)`);
        }
        if (t.topic) parts.push(`Topic: ${t.topic}`);
        if (t.auto_life_area) parts.push(`Life area: ${t.auto_life_area}`);
        if (t.auto_topics?.length) parts.push(`Auto-topics: ${t.auto_topics.join(", ")}`);
        if (t.auto_people?.length) parts.push(`People: ${t.auto_people.join(", ")}`);
        if (t.auto_action_items?.length) parts.push(`Action items: ${t.auto_action_items.join("; ")}`);
        if (t.auto_sentiment) parts.push(`Sentiment: ${t.auto_sentiment}`);
        parts.push(`Date: ${date}`);
        parts.push(`ID: ${t.id}`);

        return textResult(parts.join("\n"));
      },
    },
    url: {
      description: "Ingest a URL — fetches, extracts, chunks for semantic search (requires url)",
      required: ["url"],
      handler: async (args) => {
        const response = await ingestUrl(
          args.url as string,
          args.life_area as string | undefined,
        );

        if (!response.success || !response.data) {
          return textResult(`Failed to ingest URL: ${response.error || "Could not extract content from the page"}`, true);
        }

        const t = response.data;
        const parts = [`URL ingested successfully.`, ``];
        parts.push(`Title: ${(t.metadata as Record<string, unknown>)?.title || "Unknown"}`);
        parts.push(`Type: ${t.thought_type}`);
        if (t.auto_life_area) parts.push(`Life area: ${t.auto_life_area}`);
        if (t.auto_topics?.length) parts.push(`Topics: ${t.auto_topics.join(", ")}`);
        parts.push(`ID: ${t.id}`);
        parts.push(`\nThe content has been chunked and embedded for semantic search.`);

        return textResult(parts.join("\n"));
      },
    },
    document: {
      description: "Upload an image or PDF for OCR extraction and storage (requires file_data, filename, mime_type)",
      required: ["file_data", "filename", "mime_type"],
      handler: async (args) => {
        const response = await uploadDocument(
          args.file_data as string,
          args.filename as string,
          args.mime_type as string,
          args.life_area as string | undefined,
          args.context as string | undefined,
        );

        if (!response.success || !response.data) {
          return textResult(`Failed to process document: ${response.error || "Unknown error"}`, true);
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

        return textResult(parts.join("\n"));
      },
    },
    preference: {
      description: "Record a user preference/guardrail (requires preference_name, reject, want)",
      required: ["preference_name", "reject", "want"],
      handler: async (args) => {
        const response = await createPreference({
          preference_name: args.preference_name as string,
          domain: args.domain as string | undefined,
          reject: args.reject as string,
          want: args.want as string,
          constraint_type: args.constraint_type as string | undefined,
        });

        if (!response.success || !response.data) {
          return textResult(`Failed to save preference: ${response.error || "Unknown error"}`, true);
        }

        const p = response.data;
        return textResult(
          `Preference saved: "${p.preference_name}" (${p.domain})\n` +
          `  Reject: ${p.reject}\n` +
          `  Want: ${p.want}`,
        );
      },
    },
    block: {
      description: "Store a markdown constraint block — architecture docs, skill definitions, or design guidance (requires preference_name, content)",
      required: ["preference_name", "content"],
      handler: async (args) => {
        const response = await createBlock({
          preference_name: args.preference_name as string,
          domain: args.domain as string | undefined,
          content: args.content as string,
          constraint_type: args.constraint_type as string | undefined,
        });

        if (!response.success || !response.data) {
          return textResult(`Failed to save block: ${response.error || "Unknown error"}`, true);
        }

        const p = response.data;
        const preview = p.content ? p.content.substring(0, 100) + (p.content.length > 100 ? "..." : "") : "";
        return textResult(
          `Block saved: "${p.preference_name}" (${p.domain})\n` +
          `  ${preview}`,
        );
      },
    },
    remove_preference: {
      description: "Remove a previously recorded preference (requires preference_id)",
      required: ["preference_id"],
      handler: async (args) => {
        const response = await deletePreference(args.preference_id as string);

        if (!response.success) {
          return textResult(`Failed to remove preference: ${response.error || "Not found"}`, true);
        }

        return textResult(`Preference ${args.preference_id} removed.`);
      },
    },
  },
  {
    text: z.string().optional().describe("The thought content to capture (for action: thought)"),
    url: z.string().optional().describe("The URL to ingest (for action: url)"),
    life_area: z.enum(LIFE_AREAS).optional().describe("Life area to assign (optional — auto-classified if not provided)"),
    file_data: z.string().optional().describe("Base64-encoded file data (for action: document)"),
    filename: z.string().optional().describe("Original filename e.g. 'receipt.jpg' (for action: document)"),
    mime_type: z.enum(MIME_TYPES).optional().describe("MIME type of the file (for action: document)"),
    context: z.string().optional().describe("Additional context about a document (for action: document)"),
    content: z.string().optional().describe("Markdown content for constraint blocks (for action: block)"),
    preference_name: z.string().optional().describe("Short name for the preference (for action: preference or block)"),
    domain: z.string().optional().describe("Category domain e.g. 'writing', 'code' (for action: preference)"),
    reject: z.string().optional().describe("What the user does NOT want (for action: preference)"),
    want: z.string().optional().describe("What the user DOES want (for action: preference)"),
    constraint_type: z.enum(CONSTRAINT_TYPES).optional().describe("Type of constraint (for action: preference)"),
    preference_id: z.string().optional().describe("Preference ID to remove (for action: remove_preference)"),
  },
);

export default CaptureTool;
