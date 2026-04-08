// Open Brain Telegram - Audio Transcription
// Transcribes audio using the OpenAI Whisper API.
// Falls back gracefully if OPENAI_API_KEY is not configured.

export interface TranscriptionResult {
  text: string;
  durationSeconds?: number;
}

/**
 * Transcribe audio data using the OpenAI Whisper API.
 * Returns null if OPENAI_API_KEY is not set or transcription fails.
 */
export async function transcribeAudio(
  audioData: Uint8Array,
  mimeType: string,
  filename: string
): Promise<TranscriptionResult | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.warn("[OpenBrain:Transcription] OPENAI_API_KEY not set, skipping transcription");
    return null;
  }

  try {
    // Map MIME type to file extension Whisper accepts
    const ext = mimeTypeToExtension(mimeType);
    const transcriptFilename = filename.endsWith(`.${ext}`) ? filename : `audio.${ext}`;

    const formData = new FormData();
    formData.append("file", new Blob([audioData], { type: mimeType }), transcriptFilename);
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");

    console.log(`[OpenBrain:Transcription] Transcribing ${audioData.length} bytes (${mimeType})`);

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`[OpenBrain:Transcription] Whisper API error ${response.status}: ${err}`);
      return null;
    }

    const data = await response.json() as { text: string; duration?: number };
    return {
      text: data.text.trim(),
      durationSeconds: data.duration ? Math.round(data.duration) : undefined,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[OpenBrain:Transcription] Failed: ${msg}`);
    return null;
  }
}

function mimeTypeToExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/x-m4a": "m4a",
  };
  return map[mimeType] ?? "ogg";
}
