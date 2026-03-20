// Open Brain - LLM Provider Abstraction
// Pluggable interface for LLM completions (Anthropic, Ollama, etc.)

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; media_type: string; data: string }
  | { type: "document"; media_type: string; data: string };

export interface LLMProvider {
  complete(system: string, user: string, model?: string): Promise<string | null>;
  completeWithMedia(system: string, content: ContentBlock[], model?: string): Promise<string | null>;
}
