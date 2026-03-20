// Open Brain - Service Configuration

import type { LLMProvider } from "./logic/llm/types.ts";
import type { ProviderName } from "./logic/llm/factory.ts";

export interface WasabiConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

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
  wasabi: WasabiConfig | null;
}

export interface RawConfig {
  llmProvider: ProviderName;
  anthropicApiKey: string;
  ollamaUrl: string;
  aiModel: string;
  embeddingModel: string;
  basePath: string;
  apiKey: string | null;
  wasabi: WasabiConfig | null;
}

/**
 * Read raw configuration from environment variables.
 * URLs are normalized (trailing slashes stripped) so consumers don't need to.
 */
export function readRawConfig(): RawConfig {
  const ollamaUrl = (Deno.env.get("OLLAMA_URL") || "http://ollama:11434").replace(/\/+$/, "");

  // Wasabi config — all fields required for document storage
  const wasabiBucket = Deno.env.get("WASABI_BUCKET");
  const wasabiAccessKey = Deno.env.get("WASABI_ACCESS_KEY_ID");
  const wasabiSecretKey = Deno.env.get("WASABI_SECRET_ACCESS_KEY");
  const wasabi = wasabiBucket && wasabiAccessKey && wasabiSecretKey
    ? {
        endpoint: (Deno.env.get("WASABI_ENDPOINT") || "https://s3.wasabisys.com").replace(/\/+$/, ""),
        region: Deno.env.get("WASABI_REGION") || "us-east-1",
        bucket: wasabiBucket,
        accessKeyId: wasabiAccessKey,
        secretAccessKey: wasabiSecretKey,
      }
    : null;

  return {
    llmProvider: (Deno.env.get("LLM_PROVIDER") || "anthropic") as ProviderName,
    anthropicApiKey: Deno.env.get("ANTHROPIC_API_KEY") || "",
    ollamaUrl,
    aiModel: Deno.env.get("AI_MODEL") || "claude-haiku-4-5-20251001",
    embeddingModel: Deno.env.get("EMBEDDING_MODEL") || "all-minilm",
    basePath: Deno.env.get("BASE_PATH") || "",
    apiKey: Deno.env.get("OPEN_BRAIN_API_KEY") || null,
    wasabi,
  };
}
