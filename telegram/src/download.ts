// Shared utility for downloading files from the Telegram Bot API.

import { Context } from "grammy";

/**
 * Download a file by Telegram file_id. Returns the raw bytes, or null on failure.
 * Replies to the user with an error message if the download fails.
 */
export async function downloadTelegramFile(
  ctx: Context,
  fileId: string
): Promise<Uint8Array | null> {
  const file = await ctx.api.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
  const response = await fetch(fileUrl);
  if (!response.ok) {
    await ctx.reply("Failed to download file from Telegram. Try again.");
    return null;
  }
  return new Uint8Array(await response.arrayBuffer());
}
