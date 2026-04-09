// Open Brain - Standalone Service Behavior Tests
// Tests LLM factory, classifier, auth middleware, config, embeddings, supersession, and gardener

import {
  assertEquals,
  assertExists,
  assertNotEquals,
  assertStringIncludes,
} from "@std/assert";
import { Hono } from "@hono/hono";

import { createLLMProvider } from "../logic/llm/factory.ts";
import { AnthropicProvider } from "../logic/llm/anthropic-provider.ts";
import { OllamaProvider } from "../logic/llm/ollama-provider.ts";
import type { LLMProvider } from "../logic/llm/types.ts";
import { classifyThought } from "../logic/classifier.ts";
import { createAuthMiddleware } from "../middleware/auth.ts";
import { readRawConfig } from "../config.ts";
import { generateEmbedding } from "../logic/embeddings.ts";
import { OpenBrainDatabaseManager } from "../db/openBrainDatabaseManager.ts";
import { GardenAgent } from "../extensions/gardener/logic.ts";

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
  async completeWithMedia(
    _system: string,
    _content: import("../logic/llm/types.ts").ContentBlock[],
    _model?: string
  ): Promise<string | null> {
    return this.response;
  }
  async completeWithHistory(
    _system: string,
    _history: import("../logic/llm/types.ts").ConversationMessage[],
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
  app.use("*", createAuthMiddleware(apiKey, null));

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
    assertEquals(config.embeddingModel, "all-minilm");
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
// OB-020: Richer thought types
// =============================================

import { extractionToThoughtType } from "../routes/documents.ts";

Deno.test("extractionToThoughtType: receipt maps to expense", () => {
  assertEquals(extractionToThoughtType("receipt"), "expense");
});

Deno.test("extractionToThoughtType: invoice maps to expense", () => {
  assertEquals(extractionToThoughtType("invoice"), "expense");
});

Deno.test("extractionToThoughtType: bill maps to expense", () => {
  assertEquals(extractionToThoughtType("bill"), "expense");
});

Deno.test("extractionToThoughtType: agreement maps to contract", () => {
  assertEquals(extractionToThoughtType("agreement"), "contract");
});

Deno.test("extractionToThoughtType: lease maps to contract", () => {
  assertEquals(extractionToThoughtType("lease"), "contract");
});

Deno.test("extractionToThoughtType: contract maps to contract", () => {
  assertEquals(extractionToThoughtType("contract"), "contract");
});

Deno.test("extractionToThoughtType: warranty maps to maintenance", () => {
  assertEquals(extractionToThoughtType("warranty"), "maintenance");
});

Deno.test("extractionToThoughtType: manual maps to maintenance", () => {
  assertEquals(extractionToThoughtType("manual"), "maintenance");
});

Deno.test("extractionToThoughtType: insurance maps to insurance", () => {
  assertEquals(extractionToThoughtType("insurance"), "insurance");
});

Deno.test("extractionToThoughtType: policy maps to insurance", () => {
  assertEquals(extractionToThoughtType("policy"), "insurance");
});

Deno.test("extractionToThoughtType: statement maps to reference", () => {
  assertEquals(extractionToThoughtType("statement"), "reference");
});

Deno.test("extractionToThoughtType: unknown type falls back to reference", () => {
  assertEquals(extractionToThoughtType("other"), "reference");
  assertEquals(extractionToThoughtType("foobar"), "reference");
  assertEquals(extractionToThoughtType(""), "reference");
});

Deno.test("extractionToThoughtType: case-insensitive matching", () => {
  assertEquals(extractionToThoughtType("RECEIPT"), "expense");
  assertEquals(extractionToThoughtType("Invoice"), "expense");
  assertEquals(extractionToThoughtType("Agreement"), "contract");
});

Deno.test({
  name: "classifier: accepts new type 'expense'",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const mockResponse = JSON.stringify({ thought_type: "expense", topics: ["bills"], confidence: 0.9 });
    const provider = new MockLLMProvider(mockResponse);
    const result = await classifyThought("Paid $180 electric bill", provider);
    assertExists(result);
    assertEquals(result.thought_type, "expense");
  },
});

Deno.test({
  name: "classifier: accepts new type 'contract'",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const mockResponse = JSON.stringify({ thought_type: "contract", topics: ["lease"], confidence: 0.9 });
    const provider = new MockLLMProvider(mockResponse);
    const result = await classifyThought("Signed the new apartment lease", provider);
    assertExists(result);
    assertEquals(result.thought_type, "contract");
  },
});

Deno.test({
  name: "classifier: accepts new type 'maintenance'",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const mockResponse = JSON.stringify({ thought_type: "maintenance", topics: ["car"], confidence: 0.85 });
    const provider = new MockLLMProvider(mockResponse);
    const result = await classifyThought("Oil change at Jiffy Lube", provider);
    assertExists(result);
    assertEquals(result.thought_type, "maintenance");
  },
});

Deno.test({
  name: "classifier: accepts new type 'insurance'",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const mockResponse = JSON.stringify({ thought_type: "insurance", topics: ["car"], confidence: 0.9 });
    const provider = new MockLLMProvider(mockResponse);
    const result = await classifyThought("Car insurance renewal policy", provider);
    assertExists(result);
    assertEquals(result.thought_type, "insurance");
  },
});

Deno.test({
  name: "classifier: accepts new type 'event'",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const mockResponse = JSON.stringify({ thought_type: "event", topics: ["family"], confidence: 0.9 });
    const provider = new MockLLMProvider(mockResponse);
    const result = await classifyThought("Emma's birthday party last Saturday", provider);
    assertExists(result);
    assertEquals(result.thought_type, "event");
  },
});

Deno.test({
  name: "classifier: accepts new type 'person'",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const mockResponse = JSON.stringify({ thought_type: "person", topics: ["family"], confidence: 0.95 });
    const provider = new MockLLMProvider(mockResponse);
    const result = await classifyThought("Emma Chen — Robin's niece, born 1994", provider);
    assertExists(result);
    assertEquals(result.thought_type, "person");
  },
});

// =============================================
// OB-021: SessionStore
// =============================================

import { SessionStore } from "../../telegram/src/session.ts";

Deno.test("session: new store has no active sessions", () => {
  const store = new SessionStore();
  assertEquals(store.isActive(12345), false);
  assertEquals(store.getHistory(12345), []);
});

Deno.test("session: becomes active after first turn", () => {
  const store = new SessionStore();
  store.addTurn(12345, "user", "What is my car colour?");
  assertEquals(store.isActive(12345), true);
});

Deno.test("session: getHistory returns turns in order", () => {
  const store = new SessionStore();
  store.addTurn(100, "user", "question one");
  store.addTurn(100, "assistant", "answer one");
  store.addTurn(100, "user", "question two");

  const history = store.getHistory(100);
  assertEquals(history.length, 3);
  assertEquals(history[0], { role: "user", content: "question one" });
  assertEquals(history[1], { role: "assistant", content: "answer one" });
  assertEquals(history[2], { role: "user", content: "question two" });
});

Deno.test("session: clear removes session", () => {
  const store = new SessionStore();
  store.addTurn(200, "user", "hello");
  assertEquals(store.isActive(200), true);
  store.clear(200);
  assertEquals(store.isActive(200), false);
  assertEquals(store.getHistory(200), []);
});

Deno.test("session: independent sessions per chat ID", () => {
  const store = new SessionStore();
  store.addTurn(1, "user", "chat 1 message");
  store.addTurn(2, "user", "chat 2 message");

  assertEquals(store.getHistory(1).length, 1);
  assertEquals(store.getHistory(2).length, 1);
  assertEquals(store.getHistory(1)[0].content, "chat 1 message");
  assertEquals(store.getHistory(2)[0].content, "chat 2 message");
});

Deno.test("session: caps history at 20 entries (10 turns)", () => {
  const store = new SessionStore();
  // Add 25 turns (50 entries) — should be capped
  for (let i = 0; i < 25; i++) {
    store.addTurn(300, "user", `question ${i}`);
    store.addTurn(300, "assistant", `answer ${i}`);
  }
  const history = store.getHistory(300);
  assertEquals(history.length <= 20, true);
  // Most recent entries should be preserved
  const lastEntry = history[history.length - 1];
  assertEquals(lastEntry.role, "assistant");
  assertEquals(lastEntry.content, "answer 24");
});

Deno.test("session: pruneExpired removes nothing when all sessions are fresh", () => {
  const store = new SessionStore();
  store.addTurn(400, "user", "fresh session");
  store.pruneExpired();
  assertEquals(store.isActive(400), true);
});

Deno.test("session: clear on non-existent session is a no-op", () => {
  const store = new SessionStore();
  // Should not throw
  store.clear(99999);
  assertEquals(store.isActive(99999), false);
});

// =============================================
// OB-024: Transcription graceful degradation
// =============================================

import { transcribeAudio } from "../../telegram/src/transcription.ts";

Deno.test("transcription: returns null when OPENAI_API_KEY is not set", async () => {
  // Ensure the key is not set
  const saved = Deno.env.get("OPENAI_API_KEY");
  try {
    Deno.env.delete("OPENAI_API_KEY");
  } catch { /* may not be set */ }

  try {
    const result = await transcribeAudio(
      new Uint8Array([0, 1, 2]),
      "audio/ogg",
      "test.ogg"
    );
    assertEquals(result, null);
  } finally {
    if (saved !== undefined) Deno.env.set("OPENAI_API_KEY", saved);
  }
});

Deno.test("transcription: returns null when Whisper API returns an error", async () => {
  const saved = Deno.env.get("OPENAI_API_KEY");
  Deno.env.set("OPENAI_API_KEY", "invalid-key-for-test");

  try {
    // Using a tiny invalid audio payload — Whisper will reject it with 400
    const result = await transcribeAudio(
      new Uint8Array([0x00, 0x01]),
      "audio/ogg",
      "bad.ogg"
    );
    // Should return null (graceful failure), not throw
    assertEquals(result, null);
  } finally {
    if (saved !== undefined) {
      Deno.env.set("OPENAI_API_KEY", saved);
    } else {
      try { Deno.env.delete("OPENAI_API_KEY"); } catch { /* ok */ }
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

// =============================================
// Supersession (OB-022)
// =============================================

async function withTempDb<T>(fn: (db: OpenBrainDatabaseManager) => Promise<T> | T): Promise<T> {
  const tmp = Deno.makeTempFileSync({ suffix: ".db" });
  const db = new OpenBrainDatabaseManager(tmp);
  await db.initialized;
  try {
    return await fn(db);
  } finally {
    try { db.close(); } catch { /* ok */ }
    try { Deno.removeSync(tmp); } catch { /* ok */ }
  }
}

Deno.test("supersession: supersedeThought sets status and superseded_by", () =>
  withTempDb((db) => {
    const original = db.createThought({ text: "original thought", source_channel: "api" });
    const replacement = db.createThought({ text: "updated thought", source_channel: "api" });

    db.supersedeThought(original.id, replacement.id);

    const updated = db.getThought(original.id)!;
    assertEquals(updated.status, "superseded");
    assertEquals(updated.superseded_by, replacement.id);
  })
);

Deno.test("supersession: supersedeThought does not alter the replacement thought", () =>
  withTempDb((db) => {
    const original = db.createThought({ text: "original", source_channel: "api" });
    const replacement = db.createThought({ text: "replacement", source_channel: "api" });

    db.supersedeThought(original.id, replacement.id);

    const rep = db.getThought(replacement.id)!;
    assertEquals(rep.status, "active");
    assertEquals(rep.superseded_by, null);
  })
);

Deno.test("supersession: getSupersessionChain returns single thought when no chain", () =>
  withTempDb((db) => {
    const t = db.createThought({ text: "standalone thought", source_channel: "api" });
    const chain = db.getSupersessionChain(t.id);
    assertEquals(chain.length, 1);
    assertEquals(chain[0].id, t.id);
  })
);

Deno.test("supersession: getSupersessionChain returns full chain oldest-to-newest", () =>
  withTempDb((db) => {
    const v1 = db.createThought({ text: "v1", source_channel: "api" });
    const v2 = db.createThought({ text: "v2", source_channel: "api" });
    const v3 = db.createThought({ text: "v3", source_channel: "api" });

    db.supersedeThought(v1.id, v2.id);
    db.supersedeThought(v2.id, v3.id);

    // Querying from any node in the chain returns the full chain
    const chain = db.getSupersessionChain(v2.id);
    assertEquals(chain.length, 3);
    assertEquals(chain[0].id, v1.id);
    assertEquals(chain[1].id, v2.id);
    assertEquals(chain[2].id, v3.id);
  })
);

Deno.test("supersession: getSupersessionChain returns empty array for unknown id", () =>
  withTempDb((db) => {
    assertEquals(db.getSupersessionChain("nonexistent-id").length, 0);
  })
);

Deno.test("supersession: superseded thoughts excluded from listThoughts by default", () =>
  withTempDb((db) => {
    const v1 = db.createThought({ text: "old version", source_channel: "api" });
    const v2 = db.createThought({ text: "new version", source_channel: "api" });
    db.supersedeThought(v1.id, v2.id);

    const ids = db.listThoughts({}).thoughts.map(t => t.id);
    assertEquals(ids.includes(v1.id), false);
    assertEquals(ids.includes(v2.id), true);
  })
);

Deno.test("supersession: listThoughts with explicit status=superseded returns superseded thoughts", () =>
  withTempDb((db) => {
    const v1 = db.createThought({ text: "old version", source_channel: "api" });
    const v2 = db.createThought({ text: "new version", source_channel: "api" });
    db.supersedeThought(v1.id, v2.id);

    const { thoughts } = db.listThoughts({ status: "superseded" });
    assertEquals(thoughts.length, 1);
    assertEquals(thoughts[0].id, v1.id);
  })
);

// =============================================
// Gardener Digest Tests
// =============================================

function withGardenDb<T>(fn: (db: OpenBrainDatabaseManager) => Promise<T> | T): Promise<T> {
  return withTempDb((db) => {
    // Create garden_actions table (normally run as extension migration)
    db.getRawDb().prepare(`
      CREATE TABLE IF NOT EXISTS garden_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        details TEXT NOT NULL,
        affected_ids TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    return fn(db);
  });
}

Deno.test("GardenAgent digest: captures thought when gardener approves topics", { sanitizeResources: false, sanitizeOps: false }, () =>
  withGardenDb(async (db) => {
    // Two thoughts with matching auto_topics
    const t1 = db.createThought({ text: "Thought one", source_channel: "api" });
    const t2 = db.createThought({ text: "Thought two", source_channel: "api" });
    db.getRawDb().prepare("UPDATE thoughts SET auto_topics = ? WHERE id = ?").run('["test-topic"]', t1.id);
    db.getRawDb().prepare("UPDATE thoughts SET auto_topics = ? WHERE id = ?").run('["test-topic"]', t2.id);
    db.getRawDb().prepare("INSERT INTO suggested_topics (name, status) VALUES (?, 'pending')").run("test-topic");

    const agent = new GardenAgent(db, null);
    const result = await agent.runFull(false);

    assertEquals(result.summary.topics_approved, 1);

    const { thoughts } = db.listThoughts({ source_channel: "gardener" });
    assertEquals(thoughts.length, 1);
    assertStringIncludes(thoughts[0].text, "Gardener report");
  })
);

Deno.test("GardenAgent digest: skips thought capture on no-op run", { sanitizeResources: false, sanitizeOps: false }, () =>
  withGardenDb(async (db) => {
    const agent = new GardenAgent(db, null);
    await agent.runFull(false);

    const { thoughts } = db.listThoughts({ source_channel: "gardener" });
    assertEquals(thoughts.length, 0);
  })
);
