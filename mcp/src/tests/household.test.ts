import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../helpers/open-brain-client.js", () => ({
  createHouseholdItem: vi.fn(),
  searchHouseholdItems: vi.fn(),
  getHouseholdItem: vi.fn(),
  createHouseholdVendor: vi.fn(),
  listHouseholdVendors: vi.fn(),
}));

const client = await import("../helpers/open-brain-client.js");
const { default: HouseholdToolFn } = await import("../tools/household.js");

const tool = HouseholdToolFn();
const call = (args: Record<string, unknown>) =>
  tool.handler(args as never, {} as never);

describe("household tool", () => {
  beforeEach(() => vi.resetAllMocks());

  it("has correct name", () => {
    expect(tool.name).toBe("household");
  });

  describe("action: add_item", () => {
    it("adds a household item", async () => {
      vi.mocked(client.createHouseholdItem).mockResolvedValue({
        success: true,
        data: {
          id: "item-1",
          name: "Sea Salt",
          category: "paint",
          location: "Living Room",
          details: { brand: "Sherwin Williams", finish: "eggshell" },
          notes: null,
          created_at: "",
          updated_at: "",
        },
      });

      const result = await call({
        action: "add_item",
        name: "Sea Salt",
        category: "paint",
        location: "Living Room",
        details: '{"brand": "Sherwin Williams", "finish": "eggshell"}',
      });

      expect(result.content[0].text).toContain("Added household item: Sea Salt");
      expect(result.content[0].text).toContain("Category: paint");
      expect(result.content[0].text).toContain("Location: Living Room");
      expect(result.content[0].text).toContain("Sherwin Williams");
    });

    it("requires name", async () => {
      const result = await call({ action: "add_item" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("requires: name");
    });

    it("handles invalid JSON in details gracefully", async () => {
      vi.mocked(client.createHouseholdItem).mockResolvedValue({
        success: true,
        data: {
          id: "item-2",
          name: "Widget",
          category: null,
          location: null,
          details: {},
          notes: null,
          created_at: "",
          updated_at: "",
        },
      });

      const result = await call({ action: "add_item", name: "Widget", details: "not json" });
      expect(result.content[0].text).toContain("Added household item: Widget");
      // Should have passed empty details since JSON parse failed
      expect(client.createHouseholdItem).toHaveBeenCalledWith(
        expect.objectContaining({ details: {} }),
      );
    });
  });

  describe("action: search_items", () => {
    it("searches household items", async () => {
      vi.mocked(client.searchHouseholdItems).mockResolvedValue({
        success: true,
        data: [
          {
            id: "item-1",
            name: "Sea Salt",
            category: "paint",
            location: "Living Room",
            details: {},
            notes: null,
            created_at: "",
            updated_at: "",
          },
        ],
      });

      const result = await call({ action: "search_items", query: "paint" });
      expect(result.content[0].text).toContain("Found 1 item");
      expect(result.content[0].text).toContain("Sea Salt");
    });

    it("handles no results", async () => {
      vi.mocked(client.searchHouseholdItems).mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await call({ action: "search_items", query: "nonexistent" });
      expect(result.content[0].text).toContain("No household items found");
    });
  });

  describe("action: get_item", () => {
    it("gets item details", async () => {
      vi.mocked(client.getHouseholdItem).mockResolvedValue({
        success: true,
        data: {
          id: "item-1",
          name: "Sea Salt",
          category: "paint",
          location: "Living Room",
          details: { brand: "Sherwin Williams" },
          notes: "Beautiful color",
          created_at: "2026-03-15",
          updated_at: "2026-03-15",
        },
      });

      const result = await call({ action: "get_item", item_id: "item-1" });
      expect(result.content[0].text).toContain("**Sea Salt**");
      expect(result.content[0].text).toContain("Notes: Beautiful color");
    });

    it("requires item_id", async () => {
      const result = await call({ action: "get_item" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("requires: item_id");
    });
  });

  describe("action: add_vendor", () => {
    it("adds a vendor with rating display", async () => {
      vi.mocked(client.createHouseholdVendor).mockResolvedValue({
        success: true,
        data: {
          id: "v-1",
          name: "Joe's Plumbing",
          service_type: "plumber",
          phone: "555-1234",
          email: null,
          website: null,
          notes: null,
          rating: 4,
          last_used: null,
          created_at: "",
        },
      });

      const result = await call({
        action: "add_vendor",
        vendor_name: "Joe's Plumbing",
        service_type: "plumber",
        phone: "555-1234",
        rating: 4,
      });

      expect(result.content[0].text).toContain("Added vendor: Joe's Plumbing");
      expect(result.content[0].text).toContain("Service: plumber");
      expect(result.content[0].text).toContain("★★★★☆");
    });

    it("requires vendor_name", async () => {
      const result = await call({ action: "add_vendor" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("requires: vendor_name");
    });
  });

  describe("action: list_vendors", () => {
    it("lists vendors", async () => {
      vi.mocked(client.listHouseholdVendors).mockResolvedValue({
        success: true,
        data: [
          {
            id: "v-1",
            name: "Joe's Plumbing",
            service_type: "plumber",
            phone: "555-1234",
            email: null,
            website: null,
            notes: null,
            rating: 5,
            last_used: "2026-01-15",
            created_at: "",
          },
        ],
      });

      const result = await call({ action: "list_vendors" });
      expect(result.content[0].text).toContain("Found 1 vendor");
      expect(result.content[0].text).toContain("Joe's Plumbing");
      expect(result.content[0].text).toContain("★★★★★");
      expect(result.content[0].text).toContain("Last used: 2026-01-15");
    });

    it("handles empty list", async () => {
      vi.mocked(client.listHouseholdVendors).mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await call({ action: "list_vendors" });
      expect(result.content[0].text).toBe("No vendors found.");
    });
  });
});
