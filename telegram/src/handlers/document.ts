import { Context } from "grammy";
import { uploadDocument } from "../client.ts";
import { downloadTelegramFile } from "../download.ts";

export async function handleDocument(ctx: Context, openBrainUrl: string): Promise<void> {
  try {
    let fileId: string | undefined;
    let filename = "document";
    let mimeType = "application/octet-stream";

    // Photo — use largest resolution
    if (ctx.message?.photo && ctx.message.photo.length > 0) {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      fileId = photo.file_id;
      filename = "photo.jpg";
      mimeType = "image/jpeg";
    }

    // Document (PDF, images sent as files)
    if (ctx.message?.document) {
      fileId = ctx.message.document.file_id;
      filename = ctx.message.document.file_name || "document";
      mimeType = ctx.message.document.mime_type || "application/octet-stream";
    }

    if (!fileId) return;

    // Validate mime type
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(mimeType)) {
      await ctx.reply("I can process images (JPEG, PNG, WebP) and PDFs. That file type isn't supported.");
      return;
    }

    await ctx.reply("Processing document...");

    const fileData = await downloadTelegramFile(ctx, fileId);
    if (!fileData) return;
    const caption = ctx.message?.caption || undefined;

    const result = await uploadDocument(openBrainUrl, fileData, filename, mimeType, caption);

    if (result.success && result.data) {
      const ext = result.data.extraction;
      if (ext) {
        const parts = [`*${ext.title}*`];
        parts.push(`Type: ${ext.document_type}`);
        if (ext.vendor) parts.push(`Vendor: ${ext.vendor}`);
        if (ext.total_amount) parts.push(`Amount: ${ext.total_amount}`);
        if (ext.date) parts.push(`Date: ${ext.date}`);
        parts.push(`\nSaved and indexed for search.`);
        await ctx.reply(parts.join("\n"), { parse_mode: "Markdown" });
      } else {
        await ctx.reply("Document saved (extraction unavailable).");
      }
    } else {
      await ctx.reply(`Upload failed: ${result.error || "Unknown error"}`);
    }
  } catch (error) {
    console.error("Failed to process document:", error);
    await ctx.reply("Failed to process document. Please try again.");
  }
}
