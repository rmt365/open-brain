// Open Brain - Anthropic LLM Provider
// Direct SDK integration, no AI Gateway dependency

import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, ContentBlock } from "./types.ts";

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

  async completeWithMedia(
    system: string,
    content: ContentBlock[],
    model?: string
  ): Promise<string | null> {
    const resolvedModel = model ?? this.defaultModel;

    try {
      // Build Anthropic content blocks from our generic format
      const anthropicContent: Anthropic.ContentBlockParam[] = content.map((block) => {
        if (block.type === "text") {
          return { type: "text" as const, text: block.text };
        }
        if (block.type === "image") {
          return {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: block.media_type as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: block.data,
            },
          };
        }
        // document (PDF)
        return {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: block.data,
          },
        };
      });

      console.log(
        `[OpenBrain:Anthropic] Calling ${resolvedModel} with media (${content.length} blocks)`
      );

      const response = await this.client.messages.create({
        model: resolvedModel,
        max_tokens: 2000,
        temperature: this.temperature,
        system,
        messages: [{ role: "user", content: anthropicContent }],
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
      console.error(`[OpenBrain:Anthropic] Media completion failed: ${msg}`);
      return null;
    }
  }
}
