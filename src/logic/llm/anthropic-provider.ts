// Open Brain - Anthropic LLM Provider
// Direct SDK integration, no AI Gateway dependency

import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider } from "./types.ts";

export interface AnthropicProviderConfig {
  apiKey: string;
  defaultModel?: string;
  maxTokens?: number;
  temperature?: number;
}

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private defaultModel: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: AnthropicProviderConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      timeout: 30000, // 30s timeout
    });
    this.defaultModel = config.defaultModel ?? "claude-haiku-4-5-20251001";
    this.maxTokens = config.maxTokens ?? 1000;
    this.temperature = config.temperature ?? 0.3;
  }

  async complete(
    system: string,
    user: string,
    model?: string
  ): Promise<string | null> {
    const resolvedModel = model ?? this.defaultModel;

    try {
      console.log(
        `[OpenBrain:Anthropic] Calling ${resolvedModel} (system: ${system.length} chars, user: ${user.length} chars)`
      );

      const response = await this.client.messages.create({
        model: resolvedModel,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system,
        messages: [{ role: "user", content: user }],
      });

      const firstBlock = response.content[0];
      if (firstBlock && firstBlock.type === "text") {
        return firstBlock.text;
      }

      console.warn(
        `[OpenBrain:Anthropic] Unexpected response content type: ${firstBlock?.type}`
      );
      return null;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[OpenBrain:Anthropic] Completion failed: ${msg}`);
      return null;
    }
  }
}
