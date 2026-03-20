import { describe, it, expect, vi } from "vitest";

vi.mock("../helpers/open-brain-client.js", () => ({
  searchThoughts: vi.fn(),
  captureThought: vi.fn(),
  ingestUrl: vi.fn(),
  uploadDocument: vi.fn(),
  listThoughts: vi.fn(),
  getThought: vi.fn(),
  getForgottenThoughts: vi.fn(),
  getPreferencesBlock: vi.fn(),
  createPreference: vi.fn(),
  deletePreference: vi.fn(),
  getManagedTopics: vi.fn(),
  getPendingSuggestions: vi.fn(),
  approveSuggestion: vi.fn(),
  rejectSuggestion: vi.fn(),
  createHouseholdItem: vi.fn(),
  searchHouseholdItems: vi.fn(),
  getHouseholdItem: vi.fn(),
  createHouseholdVendor: vi.fn(),
  listHouseholdVendors: vi.fn(),
}));

describe("ToolFactory", () => {
  it("registers exactly 5 tools on the server", async () => {
    const { ToolFactory } = await import("../tools/tool-factory.js");

    const registered: string[] = [];
    const mockServer = {
      tool: vi.fn((...args: unknown[]) => {
        registered.push(args[0] as string);
      }),
    };

    ToolFactory(mockServer as never);

    expect(registered).toHaveLength(5);
    expect(registered).toContain("search_brain");
    expect(registered).toContain("capture");
    expect(registered).toContain("explore");
    expect(registered).toContain("household");
    expect(registered).toContain("topics");
  });
});
