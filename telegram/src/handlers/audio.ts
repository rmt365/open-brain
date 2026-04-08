import { Context } from "grammy";
import { captureThought } from "../client.ts";
import { transcribeAudio } from "../transcription.ts";
import { downloadTelegramFile } from "../download.ts";

export async function handleAudio(ctx: Context, openBrainUrl: string): Promise<void> {
  try {
    let fileId: string | undefined;
    let mimeType = "audio/ogg";
    let filename = "audio.ogg";
    let durationSeconds: number | undefined;

    if (ctx.message?.voice) {
      fileId = ctx.message.voice.file_id;
      mimeType = ctx.message.voice.mime_type || "audio/ogg";
      filename = "voice.ogg";
      durationSeconds = ctx.message.voice.duration;
    }

    if (ctx.message?.audio) {
      fileId = ctx.message.audio.file_id;
      mimeType = ctx.message.audio.mime_type || "audio/mpeg";
      filename = ctx.message.audio.file_name || "audio.mp3";
      durationSeconds = ctx.message.audio.duration;
    }

    if (!fileId) return;

    await ctx.reply("Transcribing audio...");

    const audioData = await downloadTelegramFile(ctx, fileId);
    if (!audioData) return;

    const caption = ctx.message?.caption || undefined;
    const transcription = await transcribeAudio(audioData, mimeType, filename);

    if (!transcription) {
      if (caption) {
        await captureThought(openBrainUrl, `[Audio] ${caption}`, {});
        await ctx.reply("Transcription not configured. Saved your caption as a note.");
      } else {
        await ctx.reply("Transcription not configured. Add `OPENAI_API_KEY` to enable it.");
      }
      return;
    }

    const thoughtText = caption
      ? `${transcription.text}\n\n[Context: ${caption}]`
      : transcription.text;

    const captureResult = await captureThought(openBrainUrl, thoughtText, {
      transcribed_from: "audio",
      audio_duration_seconds: durationSeconds,
      audio_mime_type: mimeType,
    });

    if (captureResult.success) {
      const duration = durationSeconds ? ` (${durationSeconds}s)` : "";
      const preview = transcription.text.length > 120
        ? transcription.text.slice(0, 120) + "…"
        : transcription.text;
      await ctx.reply(`*Transcribed${duration}:*\n${preview}\n\n_Saved and indexed._`, {
        parse_mode: "Markdown",
      });
    } else {
      await ctx.reply(`Transcription succeeded but save failed: ${captureResult.error || "Unknown error"}`);
    }
  } catch (error) {
    console.error("Audio handler failed:", error);
    await ctx.reply("Failed to process audio. Please try again.");
  }
}
