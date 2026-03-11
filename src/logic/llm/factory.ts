// Open Brain - LLM Provider Factory
// Creates the appropriate provider based on configuration

import type { LLMProvider } from "./types.ts";
import { AnthropicProvider } from "./anthropic-provider.ts";
import type { AnthropicProviderConfig } from "./anthropic-provider.ts";
import { OllamaProvider } from "./ollama-provider.ts";
import type { OllamaProviderConfig } from "./ollama-provider.ts";

export type ProviderName = "anthropic" | "ollama";

export interface LLMFactoryConfig {
  provider: ProviderName;
  anthropicApiKey: string;
  ollamaUrl: string;
  defaultModel: string;
}

/**
 * Create an LLM provider from flat config.
 * Handles provider-specific config mapping internally.
 */
export function createLLMProvider(config: LLMFactoryConfig): LLMProvider {
  switch (config.provider) {
    case "anthropic":
      return new AnthropicProvider({
        apiKey: config.anthropicApiKey,
        defaultModel: config.defaultModel,
      });
    case "ollama":
      return new OllamaProvider({
        baseUrl: config.ollamaUrl,
        defaultModel: config.defaultModel,
      });
    default:
      console.warn(
        `[OpenBrain:LLM] Unknown provider "${config.provider}", falling back to anthropic`
      );
      return new AnthropicProvider({
        apiKey: config.anthropicApiKey,
        defaultModel: config.defaultModel,
      });
  }
}

export type { LLMProvider } from "./types.ts";
export type { AnthropicProviderConfig } from "./anthropic-provider.ts";
export type { OllamaProviderConfig } from "./ollama-provider.ts";
