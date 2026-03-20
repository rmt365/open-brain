// Open Brain - Document Upload Routes
// Multipart upload endpoint for images and PDFs

import { Hono } from "@hono/hono";
import type { ThoughtManager } from "../logic/thoughts.ts";
import type { ServiceConfig } from "../config.ts";
import type { LifeArea } from "../types/index.ts";
import { DocumentStorage } from "../logic/document-storage.ts";
import { extractDocument } from "../logic/document-extractor.ts";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

const VALID_LIFE_AREAS: Set<string> = new Set([
  "craft", "business", "systems", "health",
  "marriage", "relationships", "creative", "wild", "meta",
]);

export function createDocumentRoutes(
  manager: ThoughtManager,
  config: ServiceConfig
): Hono {
  const app = new Hono();
  const storage = config.wasabi ? new DocumentStorage(config.wasabi, config.instanceName) : null;

  app.post("/upload", async (c) => {
    try {
      const body = await c.req.parseBody();
      const file = body["file"];

      if (!file || !(file instanceof File)) {
        return c.json({ success: false, error: "Missing 'file' field" }, 400);
      }

      if (!ALLOWED_TYPES.has(file.type)) {
        return c.json(
          { success: false, error: `Unsupported file type: ${file.type}. Allowed: JPEG, PNG, WebP, PDF` },
          422
        );
      }

      if (file.size > MAX_SIZE) {
        return c.json(
          { success: false, error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 20MB` },
          422
        );
      }

      const lifeAreaStr = typeof body["life_area"] === "string" ? body["life_area"] : undefined;
      const lifeArea = lifeAreaStr && VALID_LIFE_AREAS.has(lifeAreaStr)
        ? lifeAreaStr as LifeArea
        : undefined;
      const context = typeof body["context"] === "string" ? body["context"] : undefined;
      const sourceChannel = typeof body["source_channel"] === "string" ? body["source_channel"] : "web";

      const fileData = new Uint8Array(await file.arrayBuffer());
      const filename = file.name || "document";

      // Extract structured data via Claude vision
      const extraction = await extractDocument(
        fileData,
        file.type,
        config.llm.provider,
        context,
        config.llm.model
      );

      // Build thought text from extraction or fallback
      const thoughtText = extraction
        ? `${extraction.title}\n\n${extraction.extracted_text}`
        : `Uploaded document: ${filename}${context ? `\n\n${context}` : ""}`;

      // Build metadata
      const metadata: Record<string, unknown> = {
        original_filename: filename,
        mime_type: file.type,
        file_size: file.size,
      };

      if (extraction) {
        metadata.extraction = extraction;
      }

      // Upload to Wasabi (if configured)
      // We create a placeholder ID first, then update after thought creation
      let wasabiKey: string | null = null;

      // Create thought (captures immediately, embeds/classifies async)
      const thought = await manager.capture(
        thoughtText,
        sourceChannel as "api" | "web" | "telegram" | "mcp",
        metadata,
        "reference",
        undefined,
        lifeArea
      );

      // Upload original to Wasabi after thought creation (so we have the ID)
      if (storage) {
        try {
          wasabiKey = await storage.upload(thought.id, filename, fileData, file.type);
          metadata.wasabi_key = wasabiKey;
          metadata.wasabi_url = storage.getUrl(wasabiKey);
          // Update thought metadata with storage info
          manager.updateMetadata(thought.id, metadata);
          // Verify the write persisted
          const verify = manager.get(thought.id);
          const hasKey = !!(verify?.metadata as Record<string, unknown> | null)?.wasabi_key;
          console.log(`[OpenBrain:DocUpload] Metadata updated for ${thought.id}, wasabi_key=${wasabiKey}, verified=${hasKey}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[OpenBrain:DocUpload] Wasabi upload failed (thought still saved): ${msg}`);
        }
      } else {
        console.warn("[OpenBrain:DocUpload] Wasabi not configured, skipping document storage");
      }

      return c.json({
        success: true,
        data: {
          thought_id: thought.id,
          extraction,
          wasabi_key: wasabiKey,
          filename,
        },
      }, 201);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[OpenBrain:DocUpload] Upload failed: ${msg}`);
      return c.json({ success: false, error: msg }, 500);
    }
  });

  app.get("/:thoughtId", async (c) => {
    const thoughtId = c.req.param("thoughtId");

    const thought = manager.get(thoughtId);
    if (!thought) {
      return c.json({ success: false, error: "Thought not found" }, 404);
    }

    const metadata = thought.metadata as Record<string, unknown> | null;
    const wasabiKey = metadata?.wasabi_key as string | undefined;
    if (!wasabiKey) {
      return c.json({ success: false, error: "No document attached to this thought" }, 404);
    }

    if (!storage) {
      return c.json({ success: false, error: "Document storage not configured" }, 503);
    }

    try {
      const { stream, contentType, contentLength } = await storage.download(wasabiKey);
      const filename = (metadata!.original_filename as string) || "document";
      const mimeType = (metadata!.mime_type as string) || contentType;

      c.header("Content-Type", mimeType);
      c.header("Content-Disposition", `inline; filename="${filename}"`);
      if (contentLength) {
        c.header("Content-Length", String(contentLength));
      }

      return c.body(stream);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[OpenBrain:DocDownload] Failed to fetch document: ${msg}`);
      return c.json({ success: false, error: "Failed to retrieve document" }, 500);
    }
  });

  return app;
}
