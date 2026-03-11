// Open Brain - LLM Provider Abstraction
// Pluggable interface for LLM completions (Anthropic, Ollama, etc.)

export interface LLMProvider {
  complete(system: string, user: string, model?: string): Promise<string | null>;
}
