import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../helpers/open-brain-client.js", () => ({
  searchThoughts: vi.fn(),
  getPreferencesBlock: vi.fn(),
}));

const client = await import("../helpers/open-brain-client.js");
const { default: SearchBrainToolFn } = await import("../tools/search-brain.js");

const tool = SearchBrainToolFn();
const call = (args: Record<string, unknown>) =>
  tool.handler(args as never, {} as never);

describe("search_brain tool", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(client.getPreferencesBlock).mockResolvedValue({
      success: true,
      data: { block: "Use plain language." },
    });
  });

  it("has correct name", () => {
    expect(tool.name).toBe("search_brain");
  });

  it("returns search results with similarity scores", async () => {
    vi.mocked(client.searchThoughts).mockResolvedValue({
      success: true,
      data: [
        {
          thought: {
            id: "t-1",
            text: "TypeScript is great",
            thought_type: "note",
            topic: "TypeScript",
            life_area: null,
            auto_life_area: null,
            source_channel: "mcp",
            auto_type: null,
            auto_topics: null,
            confidence: null,
            auto_people: null,
            auto_action_items: null,
            auto_dates_mentioned: null,
            auto_sentiment: null,
            embedding_model: null,
            has_embedding: true,
            status: "active",
            created_at: "2026-03-15T12:00:00Z",
            updated_at: "2026-03-15T12:00:00Z",
            metadata: null,
          },
          similarity: 0.923,
          rank: 1,
        },
      ],
    });

    const result = await call({ query: "typescript" });
    expect(result.content[0].text).toContain('Found 1 thought matching "typescript"');
    expect(result.content[0].text).toContain("92.3%");
    expect(result.content[0].text).toContain("[TypeScript]");
    expect(result.content[0].text).toContain("ID: t-1");
  });

  it("injects preferences context into results", async () => {
    vi.mocked(client.searchThoughts).mockResolvedValue({
      success: true,
      data: [
        {
          thought: {
            id: "t-1",
            text: "Test",
            thought_type: "note",
            topic: null,
            life_area: null,
            auto_life_area: null,
            source_channel: "mcp",
            auto_type: null,
            auto_topics: null,
            confidence: null,
            auto_people: null,
            auto_action_items: null,
            auto_dates_mentioned: null,
            auto_sentiment: null,
            embedding_model: null,
            has_embedding: true,
            status: "active",
            created_at: "2026-03-15T12:00:00Z",
            updated_at: "2026-03-15T12:00:00Z",
            metadata: null,
          },
          similarity: 0.8,
          rank: 1,
        },
      ],
    });

    const result = await call({ query: "test" });
    expect(result.content[0].text).toContain("--- Context: User Preferences ---");
    expect(result.content[0].text).toContain("Use plain language.");
  });

  it("handles no results", async () => {
    vi.mocked(client.searchThoughts).mockResolvedValue({
      success: true,
      data: [],
    });

    const result = await call({ query: "nonexistent" });
    expect(result.content[0].text).toContain('No thoughts found matching "nonexistent"');
  });

  it("handles API errors", async () => {
    vi.mocked(client.searchThoughts).mockResolvedValue({
      success: false,
      error: "Embedding service down",
    });

    const result = await call({ query: "test" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Embedding service down");
  });

  it("handles exceptions", async () => {
    vi.mocked(client.searchThoughts).mockRejectedValue(new Error("Network timeout"));

    const result = await call({ query: "test" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Network timeout");
  });
});
