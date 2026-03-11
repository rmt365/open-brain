// Open Brain - Service Configuration

import type { LLMProvider } from "./logic/llm/types.ts";
import type { ProviderName } from "./logic/llm/factory.ts";

export interface ServiceConfig {
  llm: {
    provider: LLMProvider;
    model: string;
  };
  embedding: {
    ollamaUrl: string;
    model: string;
  };
  basePath: string;
  apiKey: string | null;
}

export interface RawConfig {
  llmProvider: ProviderName;
  anthropicApiKey: string;
  ollamaUrl: string;
  aiModel: string;
  embeddingModel: string;
  basePath: string;
  apiKey: string | null;
}

/**
 * Read raw configuration from environment variables.
 * URLs are normalized (trailing slashes stripped) so consumers don't need to.
 */
export function readRawConfig(): RawConfig {
  const ollamaUrl = (Deno.env.get("OLLAMA_URL") || "http://ollama:11434").replace(/\/+$/, "");
  return {
    llmProvider: (Deno.env.get("LLM_PROVIDER") || "anthropic") as ProviderName,
    anthropicApiKey: Deno.env.get("ANTHROPIC_API_KEY") || "",
    ollamaUrl,
    aiModel: Deno.env.get("AI_MODEL") || "claude-haiku-4-5-20251001",
    embeddingModel: Deno.env.get("EMBEDDING_MODEL") || "all-minilm",
    basePath: Deno.env.get("BASE_PATH") || "",
    apiKey: Deno.env.get("OPEN_BRAIN_API_KEY") || null,
  };
}
