import { Context } from "grammy";
import { captureThought, uploadDocument } from "../client.ts";
import { transcribeAudio } from "../transcription.ts";

export async function handleAudio(ctx: Context, openBrainUrl: string): Promise<void> {
  try {
    let fileId: string | undefined;
    let mimeType = "audio/ogg";
    let filename = "audio.ogg";
    let durationSeconds: number | undefined;

    // Voice message (recorded in Telegram)
    if (ctx.message?.voice) {
      fileId = ctx.message.voice.file_id;
      mimeType = ctx.message.voice.mime_type || "audio/ogg";
      filename = "voice.ogg";
      durationSeconds = ctx.message.voice.duration;
    }

    // Audio file sent as attachment
    if (ctx.message?.audio) {
      fileId = ctx.message.audio.file_id;
      mimeType = ctx.message.audio.mime_type || "audio/mpeg";
      filename = ctx.message.audio.file_name || "audio.mp3";
      durationSeconds = ctx.message.audio.duration;
    }

    if (!fileId) return;

    await ctx.reply("Transcribing audio...");

    // Download from Telegram
    const file = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
    const response = await fetch(fileUrl);
    if (!response.ok) {
      await ctx.reply("Failed to download audio from Telegram. Try again.");
      return;
    }

    const audioData = new Uint8Array(await response.arrayBuffer());
    const caption = ctx.message?.caption || undefined;

    // Transcribe
    const transcription = await transcribeAudio(audioData, mimeType, filename);

    if (!transcription) {
      // No API key or transcription failed — save with caption only if present
      if (caption) {
        const result = await captureThought(openBrainUrl, `[Audio] ${caption}`, {});
        if (result.success) {
          await ctx.reply("Audio transcription is not configured. Saved your caption as a note.");
        } else {
          await ctx.reply("Audio transcription is not configured. Add `OPENAI_API_KEY` to enable it.");
        }
      } else {
        await ctx.reply("Audio transcription is not configured. Add `OPENAI_API_KEY` to enable it.");
      }
      return;
    }

    // Build the thought text from the transcript (+ caption context if provided)
    const thoughtText = caption
      ? `${transcription.text}\n\n[Context: ${caption}]`
      : transcription.text;

    // Upload audio to Wasabi and save as a thought
    const uploadResult = await uploadDocument(openBrainUrl, audioData, filename, mimeType, caption);

    let thoughtId: string | undefined;
    if (uploadResult.success && uploadResult.data) {
      // Document upload creates a thought — we need to update it with the transcript
      // For now, also capture the transcript as a separate note linked in metadata
      thoughtId = uploadResult.data.thought_id;
    }

    // Capture the transcript as the primary thought
    const captureResult = await captureThought(openBrainUrl, thoughtText, {
      transcribed_from: "audio",
      audio_duration_seconds: durationSeconds,
      audio_mime_type: mimeType,
      audio_thought_id: thoughtId,
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
