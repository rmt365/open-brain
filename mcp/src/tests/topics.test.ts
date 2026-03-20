import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../helpers/open-brain-client.js", () => ({
  getManagedTopics: vi.fn(),
  getPendingSuggestions: vi.fn(),
  approveSuggestion: vi.fn(),
  rejectSuggestion: vi.fn(),
}));

const client = await import("../helpers/open-brain-client.js");
const { default: TopicsToolFn } = await import("../tools/topics.js");

const tool = TopicsToolFn();
const call = (args: Record<string, unknown>) =>
  tool.handler(args as never, {} as never);

describe("topics tool", () => {
  beforeEach(() => vi.resetAllMocks());

  it("has correct name", () => {
    expect(tool.name).toBe("topics");
  });

  describe("action: list", () => {
    it("lists managed topics grouped by life area", async () => {
      vi.mocked(client.getManagedTopics).mockResolvedValue({
        success: true,
        data: [
          { id: 1, name: "TypeScript", life_area: "craft", created_at: "", active: true },
          { id: 2, name: "Running", life_area: "health", created_at: "", active: true },
        ],
      });
      vi.mocked(client.getPendingSuggestions).mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await call({ action: "list" });
      expect(result.content[0].text).toContain("2 managed topics");
      expect(result.content[0].text).toContain("craft");
      expect(result.content[0].text).toContain("TypeScript");
      expect(result.content[0].text).toContain("health");
      expect(result.content[0].text).toContain("Running");
    });

    it("shows pending suggestions", async () => {
      vi.mocked(client.getManagedTopics).mockResolvedValue({
        success: true,
        data: [
          { id: 1, name: "Go", life_area: "craft", created_at: "", active: true },
        ],
      });
      vi.mocked(client.getPendingSuggestions).mockResolvedValue({
        success: true,
        data: [
          { id: 10, name: "Rust", suggested_from_thought_id: null, status: "pending", created_at: "" },
        ],
      });

      const result = await call({ action: "list" });
      expect(result.content[0].text).toContain("1 pending suggestion");
      expect(result.content[0].text).toContain('"Rust" (id: 10)');
    });

    it("handles empty topics", async () => {
      vi.mocked(client.getManagedTopics).mockResolvedValue({
        success: true,
        data: [],
      });
      vi.mocked(client.getPendingSuggestions).mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await call({ action: "list" });
      expect(result.content[0].text).toBe("No managed topics found.");
    });

    it("returns error on API failure", async () => {
      vi.mocked(client.getManagedTopics).mockResolvedValue({
        success: false,
        error: "Server down",
      });

      const result = await call({ action: "list" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Server down");
    });
  });

  describe("action: approve", () => {
    it("approves a suggestion", async () => {
      vi.mocked(client.approveSuggestion).mockResolvedValue({
        success: true,
        data: { id: 1, name: "Rust", life_area: "craft", created_at: "", active: true },
      });

      const result = await call({ action: "approve", suggestion_id: 10, life_area: "craft" });
      expect(result.content[0].text).toContain('Topic "Rust" approved');
      expect(result.content[0].text).toContain("area: craft");
      expect(client.approveSuggestion).toHaveBeenCalledWith(10, "craft");
    });

    it("requires suggestion_id", async () => {
      const result = await call({ action: "approve" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("requires: suggestion_id");
    });
  });

  describe("action: reject", () => {
    it("rejects a suggestion", async () => {
      vi.mocked(client.rejectSuggestion).mockResolvedValue({ success: true });

      const result = await call({ action: "reject", suggestion_id: 10 });
      expect(result.content[0].text).toBe("Suggestion rejected.");
      expect(client.rejectSuggestion).toHaveBeenCalledWith(10);
    });

    it("requires suggestion_id", async () => {
      const result = await call({ action: "reject" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("requires: suggestion_id");
    });
  });
});
