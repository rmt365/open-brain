import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../helpers/open-brain-client.js", () => ({
  captureThought: vi.fn(),
  ingestUrl: vi.fn(),
  uploadDocument: vi.fn(),
  createPreference: vi.fn(),
  deletePreference: vi.fn(),
}));

const client = await import("../helpers/open-brain-client.js");
const { default: CaptureToolFn } = await import("../tools/capture.js");

const tool = CaptureToolFn();
const call = (args: Record<string, unknown>) =>
  tool.handler(args as never, {} as never);

const fakeThought = {
  id: "abc-123",
  text: "Test thought",
  thought_type: "note",
  topic: "testing",
  life_area: null,
  auto_life_area: "craft",
  source_channel: "mcp",
  source_url: null,
  auto_type: "idea",
  auto_topics: ["testing", "vitest"],
  confidence: 0.95,
  auto_people: ["Alice"],
  auto_action_items: ["write tests"],
  auto_dates_mentioned: null,
  auto_sentiment: "positive",
  embedding_model: null,
  has_embedding: false,
  status: "active",
  created_at: "2026-03-20T12:00:00Z",
  updated_at: "2026-03-20T12:00:00Z",
  metadata: null,
};

describe("capture tool", () => {
  beforeEach(() => vi.resetAllMocks());

  it("has correct name", () => {
    expect(tool.name).toBe("capture");
  });

  it("lists all actions in description", () => {
    expect(tool.description).toContain("thought:");
    expect(tool.description).toContain("url:");
    expect(tool.description).toContain("document:");
    expect(tool.description).toContain("preference:");
    expect(tool.description).toContain("remove_preference:");
  });

  describe("action: thought", () => {
    it("captures a thought and returns classification details", async () => {
      vi.mocked(client.captureThought).mockResolvedValue({
        success: true,
        data: fakeThought,
      });

      const result = await call({ action: "thought", text: "Test thought" });
      expect(result.content[0].text).toContain("Thought captured successfully");
      expect(result.content[0].text).toContain("Type: note");
      expect(result.content[0].text).toContain("Auto-classified as: idea (confidence: 95%)");
      expect(result.content[0].text).toContain("Topic: testing");
      expect(result.content[0].text).toContain("Life area: craft");
      expect(result.content[0].text).toContain("People: Alice");
      expect(result.content[0].text).toContain("Action items: write tests");
      expect(result.content[0].text).toContain("ID: abc-123");
    });

    it("requires text parameter", async () => {
      const result = await call({ action: "thought" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("requires: text");
    });

    it("returns error on API failure", async () => {
      vi.mocked(client.captureThought).mockResolvedValue({
        success: false,
        error: "Classification failed",
      });

      const result = await call({ action: "thought", text: "test" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Classification failed");
    });
  });

  describe("action: url", () => {
    it("ingests a URL successfully", async () => {
      vi.mocked(client.ingestUrl).mockResolvedValue({
        success: true,
        data: {
          ...fakeThought,
          thought_type: "reference",
          metadata: { title: "Great Article" } as Record<string, unknown>,
        },
      });

      const result = await call({ action: "url", url: "https://example.com/article" });
      expect(result.content[0].text).toContain("URL ingested successfully");
      expect(result.content[0].text).toContain("Title: Great Article");
      expect(client.ingestUrl).toHaveBeenCalledWith("https://example.com/article", undefined);
    });

    it("passes life_area when provided", async () => {
      vi.mocked(client.ingestUrl).mockResolvedValue({
        success: true,
        data: { ...fakeThought, metadata: { title: "Test" } as Record<string, unknown> },
      });

      await call({ action: "url", url: "https://example.com", life_area: "craft" });
      expect(client.ingestUrl).toHaveBeenCalledWith("https://example.com", "craft");
    });

    it("requires url parameter", async () => {
      const result = await call({ action: "url" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("requires: url");
    });
  });

  describe("action: document", () => {
    it("uploads a document", async () => {
      vi.mocked(client.uploadDocument).mockResolvedValue({
        success: true,
        data: {
          thought_id: "doc-456",
          extraction: {
            title: "Receipt",
            document_type: "receipt",
            vendor: "ACME",
            total_amount: "$42.00",
            date: "2026-03-20",
          },
          wasabi_key: "docs/receipt.pdf",
          filename: "receipt.pdf",
        },
      });

      const result = await call({
        action: "document",
        file_data: "base64data",
        filename: "receipt.pdf",
        mime_type: "application/pdf",
      });

      expect(result.content[0].text).toContain("Document processed successfully");
      expect(result.content[0].text).toContain("Title: Receipt");
      expect(result.content[0].text).toContain("Vendor: ACME");
      expect(result.content[0].text).toContain("Amount: $42.00");
      expect(result.content[0].text).toContain("Thought ID: doc-456");
    });

    it("requires file_data, filename, and mime_type", async () => {
      const result = await call({ action: "document" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("file_data");
      expect(result.content[0].text).toContain("filename");
      expect(result.content[0].text).toContain("mime_type");
    });
  });

  describe("action: preference", () => {
    it("creates a preference", async () => {
      vi.mocked(client.createPreference).mockResolvedValue({
        success: true,
        data: {
          id: 1,
          preference_name: "Writing tone",
          domain: "writing",
          reject: "Flowery language",
          want: "Direct prose",
          constraint_type: "quality standard",
          created_at: "",
          updated_at: "",
        },
      });

      const result = await call({
        action: "preference",
        preference_name: "Writing tone",
        domain: "writing",
        reject: "Flowery language",
        want: "Direct prose",
      });

      expect(result.content[0].text).toContain('Preference saved: "Writing tone"');
      expect(result.content[0].text).toContain("Reject: Flowery language");
      expect(result.content[0].text).toContain("Want: Direct prose");
    });

    it("requires preference_name, reject, and want", async () => {
      const result = await call({ action: "preference" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("preference_name");
      expect(result.content[0].text).toContain("reject");
      expect(result.content[0].text).toContain("want");
    });
  });

  describe("action: remove_preference", () => {
    it("removes a preference", async () => {
      vi.mocked(client.deletePreference).mockResolvedValue({ success: true });

      const result = await call({ action: "remove_preference", preference_id: 42 });
      expect(result.content[0].text).toBe("Preference 42 removed.");
      expect(client.deletePreference).toHaveBeenCalledWith(42);
    });

    it("requires preference_id", async () => {
      const result = await call({ action: "remove_preference" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("requires: preference_id");
    });
  });
});
