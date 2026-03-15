// Open Brain - Standalone Service Behavior Tests
// Tests LLM factory, classifier, auth middleware, config, and embeddings

import {
  assertEquals,
  assertExists,
  assertNotEquals,
} from "jsr:@std/assert";
import { Hono } from "@hono/hono";

import { createLLMProvider } from "../logic/llm/factory.ts";
import { AnthropicProvider } from "../logic/llm/anthropic-provider.ts";
import { OllamaProvider } from "../logic/llm/ollama-provider.ts";
import type { LLMProvider } from "../logic/llm/types.ts";
import { classifyThought } from "../logic/classifier.ts";
import { createAuthMiddleware } from "../middleware/auth.ts";
import { readRawConfig } from "../config.ts";
import { generateEmbedding } from "../logic/embeddings.ts";

// =============================================
// Mock LLM Provider
// =============================================

class MockLLMProvider implements LLMProvider {
  constructor(private response: string | null) {}
  async complete(
    _system: string,
    _user: string,
    _model?: string
  ): Promise<string | null> {
    return this.response;
  }
}

// =============================================
// LLM Provider Factory
// =============================================

Deno.test("factory: creates AnthropicProvider for 'anthropic'", () => {
  const provider = createLLMProvider({
    provider: "anthropic",
    anthropicApiKey: "test-key",
    ollamaUrl: "http://localhost:11434",
    defaultModel: "test-model",
  });
  assertExists(provider);
  assertEquals(provider instanceof AnthropicProvider, true);
});

Deno.test("factory: creates OllamaProvider for 'ollama'", () => {
  const provider = createLLMProvider({
    provider: "ollama",
    anthropicApiKey: "",
    ollamaUrl: "http://localhost:11434",
    defaultModel: "test-model",
  });
  assertExists(provider);
  assertEquals(provider instanceof OllamaProvider, true);
});

Deno.test("factory: falls back to AnthropicProvider for unknown provider", () => {
  const provider = createLLMProvider({
    provider: "unknown-provider" as "anthropic",
    anthropicApiKey: "test-key",
    ollamaUrl: "http://localhost:11434",
    defaultModel: "test-model",
  });
  assertExists(provider);
  assertEquals(provider instanceof AnthropicProvider, true);
});

// =============================================
// Classifier
// =============================================

// Note: classifier tests use sanitizeResources/sanitizeOps: false because
// PromptLoader uses hotReload which starts a file watcher timer internally.
// The watcher is a singleton that persists across tests -- not a real leak.

Deno.test({
  name: "classifier: returns correct classification for valid JSON response",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
  const mockResponse = JSON.stringify({
    thought_type: "idea",
    topics: ["testing"],
    confidence: 0.9,
    people: ["Alice"],
    action_items: ["build test suite"],
    dates_mentioned: ["next week"],
    sentiment: "positive",
  });
  const provider = new MockLLMProvider(mockResponse);
  const result = await classifyThought("I should build a test suite", provider);

  assertExists(result);
  assertEquals(result.thought_type, "idea");
  assertEquals(result.topics, ["testing"]);
  assertEquals(result.confidence, 0.9);
  assertEquals(result.people, ["Alice"]);
  assertEquals(result.action_items, ["build test suite"]);
  assertEquals(result.dates_mentioned, ["next week"]);
  assertEquals(result.sentiment, "positive");
  },
});

Deno.test({
  name: "classifier: parses JSON wrapped in markdown code block",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
  const mockResponse =
    '```json\n{"thought_type": "task", "topics": ["deployment", "docker"], "confidence": 0.85, "people": [], "action_items": ["deploy container"], "dates_mentioned": [], "sentiment": "neutral"}\n```';
  const provider = new MockLLMProvider(mockResponse);
  const result = await classifyThought("Deploy the new container", provider);

  assertExists(result);
  assertEquals(result.thought_type, "task");
  assertEquals(result.topics, ["deployment", "docker"]);
  assertEquals(result.confidence, 0.85);
  assertEquals(result.action_items, ["deploy container"]);
  assertEquals(result.sentiment, "neutral");
  },
});

Deno.test({
  name: "classifier: returns null when LLM returns null (graceful degradation)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
  const provider = new MockLLMProvider(null);
  const result = await classifyThought("Some thought text", provider);

  assertEquals(result, null);
  },
});

Deno.test({
  name: "classifier: normalizes invalid thought_type to 'note'",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
  const mockResponse = JSON.stringify({
    thought_type: "banana",
    topics: ["fruit"],
    confidence: 0.7,
  });
  const provider = new MockLLMProvider(mockResponse);
  const result = await classifyThought("I like bananas", provider);

  assertExists(result);
  assertEquals(result.thought_type, "note");
  },
});

Deno.test({
  name: "classifier: clamps confidence above 1 to 1",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
  const mockResponse = JSON.stringify({
    thought_type: "idea",
    topics: ["test"],
    confidence: 5.0,
  });
  const provider = new MockLLMProvider(mockResponse);
  const result = await classifyThought("A high confidence thought", provider);

  assertExists(result);
  assertEquals(result.confidence, 1.0);
  },
});

Deno.test({
  name: "classifier: clamps negative confidence to 0",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
  const mockResponse = JSON.stringify({
    thought_type: "idea",
    topics: ["test"],
    confidence: -0.5,
  });
  const provider = new MockLLMProvider(mockResponse);
  const result = await classifyThought("A low confidence thought", provider);

  assertExists(result);
  assertEquals(result.confidence, 0);
  },
});

Deno.test({
  name: "classifier: limits topics to 5 max",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
  const mockResponse = JSON.stringify({
    thought_type: "observation",
    topics: ["a", "b", "c", "d", "e", "f", "g"],
    confidence: 0.8,
  });
  const provider = new MockLLMProvider(mockResponse);
  const result = await classifyThought("Many topics", provider);

  assertExists(result);
  assertEquals(result.topics.length, 5);
  assertEquals(result.topics, ["a", "b", "c", "d", "e"]);
  },
});

Deno.test({
  name: "classifier: handles missing fields with defaults",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
  // No thought_type, no topics, no confidence, no new fields
  const mockResponse = JSON.stringify({});
  const provider = new MockLLMProvider(mockResponse);
  const result = await classifyThought("Empty classification", provider);

  assertExists(result);
  assertEquals(result.thought_type, "note"); // defaults to note
  assertEquals(result.topics, []); // defaults to empty
  assertEquals(result.confidence, 0.5); // defaults to 0.5
  assertEquals(result.people, []); // defaults to empty
  assertEquals(result.action_items, []); // defaults to empty
  assertEquals(result.dates_mentioned, []); // defaults to empty
  assertEquals(result.sentiment, null); // defaults to null
  },
});

Deno.test({
  name: "classifier: normalizes invalid sentiment to null",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
  const mockResponse = JSON.stringify({
    thought_type: "note",
    topics: ["test"],
    confidence: 0.8,
    sentiment: "angry",
  });
  const provider = new MockLLMProvider(mockResponse);
  const result = await classifyThought("Invalid sentiment", provider);

  assertExists(result);
  assertEquals(result.sentiment, null);
  },
});

Deno.test({
  name: "classifier: returns null for unparseable response",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
  const provider = new MockLLMProvider("This is not JSON at all and has no braces");
  const result = await classifyThought("Bad response", provider);

  assertEquals(result, null);
  },
});

// =============================================
// Auth Middleware
// =============================================

function createTestApp(apiKey: string | null): Hono {
  const app = new Hono();
  app.use("*", createAuthMiddleware(apiKey));

  // Test routes
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.get("/manifest", (c) => c.json({ service: "test" }));
  app.get("/ui/index.html", (c) => c.text("UI page"));
  app.get("/ui/static/app.js", (c) => c.text("JS file"));
  app.get("/api/thoughts", (c) => c.json({ items: [] }));
  app.post("/api/capture", (c) => c.json({ success: true }));

  return app;
}

Deno.test("auth: no API key configured - all requests pass through", async () => {
  const app = createTestApp(null);
  const res = await app.request("/api/thoughts");
  assertEquals(res.status, 200);
});

Deno.test("auth: API key set - request without header returns 401", async () => {
  const app = createTestApp("my-secret-key");
  const res = await app.request("/api/thoughts");
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Unauthorized");
});

Deno.test("auth: API key set - correct Bearer token passes", async () => {
  const app = createTestApp("my-secret-key");
  const res = await app.request("/api/thoughts", {
    headers: { Authorization: "Bearer my-secret-key" },
  });
  assertEquals(res.status, 200);
});

Deno.test("auth: API key set - wrong Bearer token returns 401", async () => {
  const app = createTestApp("my-secret-key");
  const res = await app.request("/api/thoughts", {
    headers: { Authorization: "Bearer wrong-key" },
  });
  assertEquals(res.status, 401);
});

Deno.test("auth: health endpoint always skips auth", async () => {
  const app = createTestApp("my-secret-key");
  const res = await app.request("/health");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, "ok");
});

Deno.test("auth: manifest endpoint always skips auth", async () => {
  const app = createTestApp("my-secret-key");
  const res = await app.request("/manifest");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.service, "test");
});

Deno.test("auth: UI paths always skip auth", async () => {
  const app = createTestApp("my-secret-key");
  const res = await app.request("/ui/index.html");
  assertEquals(res.status, 200);

  const res2 = await app.request("/ui/static/app.js");
  assertEquals(res2.status, 200);
});

Deno.test("auth: OPTIONS requests always skip auth (CORS preflight)", async () => {
  const app = createTestApp("my-secret-key");
  const res = await app.request("/api/thoughts", { method: "OPTIONS" });
  // OPTIONS passes through middleware; Hono returns 404 for unmatched OPTIONS
  // but the key assertion is it does NOT return 401
  assertNotEquals(res.status, 401);
});

// =============================================
// Config
// =============================================

Deno.test("config: returns defaults when env vars not set", () => {
  // Temporarily clear any env vars that might be set
  const savedVars: Record<string, string | undefined> = {};
  const envKeys = [
    "LLM_PROVIDER",
    "ANTHROPIC_API_KEY",
    "OLLAMA_URL",
    "AI_MODEL",
    "EMBEDDING_MODEL",
    "BASE_PATH",
    "OPEN_BRAIN_API_KEY",
  ];

  // Save and delete
  for (const key of envKeys) {
    savedVars[key] = Deno.env.get(key);
    try {
      Deno.env.delete(key);
    } catch {
      // May not be set
    }
  }

  try {
    const config = readRawConfig();
    assertEquals(config.llmProvider, "anthropic");
    assertEquals(config.anthropicApiKey, "");
    assertEquals(config.ollamaUrl, "http://ollama:11434");
    assertEquals(config.aiModel, "claude-haiku-4-5-20251001");
    assertEquals(config.embeddingModel, "mxbai-embed-large");
    assertEquals(config.basePath, "");
    assertEquals(config.apiKey, null);
  } finally {
    // Restore
    for (const key of envKeys) {
      if (savedVars[key] !== undefined) {
        Deno.env.set(key, savedVars[key]!);
      }
    }
  }
});

Deno.test("config: reads override values from env vars", () => {
  // Save originals
  const savedVars: Record<string, string | undefined> = {};
  const overrides: Record<string, string> = {
    LLM_PROVIDER: "ollama",
    ANTHROPIC_API_KEY: "sk-test-key",
    OLLAMA_URL: "http://localhost:11434",
    AI_MODEL: "llama3",
    EMBEDDING_MODEL: "nomic-embed-text",
    BASE_PATH: "/brain",
    OPEN_BRAIN_API_KEY: "my-api-key",
  };

  for (const key of Object.keys(overrides)) {
    savedVars[key] = Deno.env.get(key);
    Deno.env.set(key, overrides[key]);
  }

  try {
    const config = readRawConfig();
    assertEquals(config.llmProvider, "ollama");
    assertEquals(config.anthropicApiKey, "sk-test-key");
    assertEquals(config.ollamaUrl, "http://localhost:11434");
    assertEquals(config.aiModel, "llama3");
    assertEquals(config.embeddingModel, "nomic-embed-text");
    assertEquals(config.basePath, "/brain");
    assertEquals(config.apiKey, "my-api-key");
  } finally {
    // Restore
    for (const key of Object.keys(overrides)) {
      if (savedVars[key] !== undefined) {
        Deno.env.set(key, savedVars[key]!);
      } else {
        try {
          Deno.env.delete(key);
        } catch {
          // ignore
        }
      }
    }
  }
});

// =============================================
// Embeddings graceful degradation
// =============================================

Deno.test("embeddings: returns null when Ollama is unreachable", async () => {
  // Use a URL that will definitely fail to connect
  const result = await generateEmbedding(
    "test thought",
    "http://127.0.0.1:1",  // port 1 - should refuse connection immediately
    "all-minilm"
  );
  assertEquals(result, null);
});
