import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../helpers/open-brain-client.js", () => ({
  listThoughts: vi.fn(),
  getThought: vi.fn(),
  searchThoughts: vi.fn(),
  getForgottenThoughts: vi.fn(),
  getPreferencesBlock: vi.fn(),
}));

const client = await import("../helpers/open-brain-client.js");
const { default: ExploreToolFn } = await import("../tools/explore.js");

const tool = ExploreToolFn();
const call = (args: Record<string, unknown>) =>
  tool.handler(args as never, {} as never);

const fakeThought = {
  id: "t-1",
  text: "A test thought about TypeScript",
  thought_type: "note",
  topic: "TypeScript",
  life_area: "craft",
  auto_life_area: "craft",
  source_channel: "mcp",
  auto_type: null,
  auto_topics: null,
  confidence: null,
  auto_people: null,
  auto_action_items: null,
  auto_dates_mentioned: null,
  auto_sentiment: null,
  embedding_model: "all-minilm",
  has_embedding: true,
  status: "active",
  created_at: "2026-03-15T12:00:00Z",
  updated_at: "2026-03-15T12:00:00Z",
  metadata: null,
};

describe("explore tool", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Context injector calls getPreferencesBlock — return empty
    vi.mocked(client.getPreferencesBlock).mockResolvedValue({
      success: true,
      data: { block: "" },
    });
  });

  it("has correct name", () => {
    expect(tool.name).toBe("explore");
  });

  describe("action: recent", () => {
    it("lists recent thoughts", async () => {
      vi.mocked(client.listThoughts).mockResolvedValue({
        success: true,
        data: {
          items: [fakeThought],
          total: 1,
          limit: 20,
          offset: 0,
        },
      });

      const result = await call({ action: "recent" });
      expect(result.content[0].text).toContain("Showing 1 of 1 thoughts");
      expect(result.content[0].text).toContain("[note]");
      expect(result.content[0].text).toContain("TypeScript");
      expect(result.content[0].text).toContain("t-1");
    });

    it("shows no-results message with filters", async () => {
      vi.mocked(client.listThoughts).mockResolvedValue({
        success: true,
        data: { items: [], total: 0, limit: 20, offset: 0 },
      });

      const result = await call({ action: "recent", thought_type: "idea", topic: "Go" });
      expect(result.content[0].text).toContain("No thoughts found");
      expect(result.content[0].text).toContain("type=idea");
      expect(result.content[0].text).toContain('topic="Go"');
    });

    it("passes filters to API", async () => {
      vi.mocked(client.listThoughts).mockResolvedValue({
        success: true,
        data: { items: [], total: 0, limit: 20, offset: 0 },
      });

      await call({ action: "recent", thought_type: "task", since_days: 3, limit: 5 });

      const callArgs = vi.mocked(client.listThoughts).mock.calls[0][0];
      expect(callArgs.thought_type).toBe("task");
      expect(callArgs.limit).toBe(5);
      expect(callArgs.since).toBeDefined();
    });
  });

  describe("action: related", () => {
    it("finds related thoughts", async () => {
      vi.mocked(client.getThought).mockResolvedValue({
        success: true,
        data: fakeThought,
      });
      vi.mocked(client.searchThoughts).mockResolvedValue({
        success: true,
        data: [
          { thought: { ...fakeThought, id: "t-2", text: "Related thought" }, similarity: 0.85, rank: 1 },
          { thought: fakeThought, similarity: 1.0, rank: 0 }, // self — should be filtered
        ],
      });

      const result = await call({ action: "related", thought_id: "t-1" });
      expect(result.content[0].text).toContain("Source: [note]");
      expect(result.content[0].text).toContain("1 related thought");
      expect(result.content[0].text).toContain("85.0% similar");
      expect(result.content[0].text).toContain("t-2");
      // Should NOT contain the source thought as a result
      expect(result.content[0].text).not.toContain("ID: t-1\n");
    });

    it("requires thought_id", async () => {
      const result = await call({ action: "related" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("requires: thought_id");
    });

    it("handles thought not found", async () => {
      vi.mocked(client.getThought).mockResolvedValue({
        success: false,
        error: "Not found",
      });

      const result = await call({ action: "related", thought_id: "nope" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Thought not found");
    });
  });

  describe("action: forgotten", () => {
    it("surfaces forgotten thoughts", async () => {
      const oldThought = {
        ...fakeThought,
        id: "t-old",
        text: "Something from long ago",
        created_at: "2025-01-01T12:00:00Z",
      };
      vi.mocked(client.getForgottenThoughts).mockResolvedValue({
        success: true,
        data: [oldThought],
      });

      const result = await call({ action: "forgotten" });
      expect(result.content[0].text).toContain("1 forgotten thought surfaced");
      expect(result.content[0].text).toContain("[craft]");
      expect(result.content[0].text).toContain("Something from long ago");
      expect(result.content[0].text).toContain("days ago");
    });

    it("handles no forgotten thoughts", async () => {
      vi.mocked(client.getForgottenThoughts).mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await call({ action: "forgotten" });
      expect(result.content[0].text).toContain("No forgotten thoughts");
    });

    it("passes parameters to API", async () => {
      vi.mocked(client.getForgottenThoughts).mockResolvedValue({
        success: true,
        data: [],
      });

      await call({ action: "forgotten", min_age_days: 60, limit: 10, life_area: "health" });
      expect(client.getForgottenThoughts).toHaveBeenCalledWith(60, 10, "health");
    });
  });
});
