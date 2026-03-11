// Open Brain - Ollama LLM Provider
// For local LLM inference (future use when local classification is ready)

import type { LLMProvider } from "./types.ts";

export interface OllamaProviderConfig {
  baseUrl: string;
  defaultModel?: string;
}

interface OllamaChatResponse {
  message: {
    content: string;
  };
}

export class OllamaProvider implements LLMProvider {
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: OllamaProviderConfig) {
    this.baseUrl = config.baseUrl;
    this.defaultModel = config.defaultModel ?? "llama3";
  }

  async complete(
    system: string,
    user: string,
    model?: string
  ): Promise<string | null> {
    const resolvedModel = model ?? this.defaultModel;

    try {
      console.log(
        `[OpenBrain:Ollama] Calling ${resolvedModel} at ${this.baseUrl} (system: ${system.length} chars, user: ${user.length} chars)`
      );

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: resolvedModel,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          stream: false,
        }),
        signal: AbortSignal.timeout(60000), // 60s timeout for local models
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[OpenBrain:Ollama] HTTP ${response.status}: ${errorText}`
        );
        return null;
      }

      const data = (await response.json()) as OllamaChatResponse;
      return data.message?.content ?? null;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[OpenBrain:Ollama] Completion failed: ${msg}`);
      return null;
    }
  }
}
