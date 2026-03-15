import { z } from "zod";
import { CreateTool } from "../helpers/create-tool.js";
import {
  createHouseholdItem,
  searchHouseholdItems,
  getHouseholdItem,
  createHouseholdVendor,
  listHouseholdVendors,
} from "../helpers/open-brain-client.js";

export const AddHouseholdItemTool = CreateTool(
  "add_household_item",
  "Add a household item (paint color, appliance, measurement, document, etc.) to the knowledge base.",
  {
    name: z.string().describe("Name or description of the item"),
    category: z.string().optional().describe("Category (e.g. 'paint', 'appliance', 'measurement', 'document')"),
    location: z.string().optional().describe("Location in the home (e.g. 'Living Room', 'Kitchen')"),
    details: z.string().optional().describe("Flexible metadata as JSON string (e.g. '{\"brand\": \"Sherwin Williams\", \"color\": \"Sea Salt\"}')"),
    notes: z.string().optional().describe("Additional notes or context"),
  },
  async ({ name, category, location, details, notes }) => {
    try {
      let parsedDetails: Record<string, unknown> = {};
      if (details) {
        try { parsedDetails = JSON.parse(details); } catch { /* keep empty */ }
      }

      const response = await createHouseholdItem({
        name,
        category,
        location,
        details: parsedDetails,
        notes,
      });

      if (!response.success || !response.data) {
        return {
          content: [{ type: "text" as const, text: `Failed to add item: ${response.error || "Unknown error"}` }],
          isError: true,
        };
      }

      const item = response.data;
      const parts = [`Added household item: ${item.name} (ID: ${item.id})`];
      if (item.category) parts.push(`Category: ${item.category}`);
      if (item.location) parts.push(`Location: ${item.location}`);
      if (Object.keys(item.details).length > 0) parts.push(`Details: ${JSON.stringify(item.details)}`);
      if (item.notes) parts.push(`Notes: ${item.notes}`);

      return { content: [{ type: "text" as const, text: parts.join("\n") }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error adding item: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  },
);

export const SearchHouseholdItemsTool = CreateTool(
  "search_household_items",
  "Search household items by name, category, or location.",
  {
    query: z.string().optional().describe("Search term (searches name, category, location, and notes)"),
    category: z.string().optional().describe("Filter by specific category"),
    location: z.string().optional().describe("Filter by specific location"),
  },
  async ({ query, category, location }) => {
    try {
      const response = await searchHouseholdItems(query, category, location);

      if (!response.success || !response.data) {
        return {
          content: [{ type: "text" as const, text: `Search failed: ${response.error || "Unknown error"}` }],
          isError: true,
        };
      }

      const items = response.data;
      if (items.length === 0) {
        return { content: [{ type: "text" as const, text: "No household items found matching your search." }] };
      }

      const lines = items.map((item, i) => {
        const parts = [`${i + 1}. ${item.name}`];
        if (item.category) parts[0] += ` [${item.category}]`;
        if (item.location) parts.push(`   Location: ${item.location}`);
        if (Object.keys(item.details).length > 0) parts.push(`   Details: ${JSON.stringify(item.details)}`);
        if (item.notes) parts.push(`   Notes: ${item.notes}`);
        parts.push(`   ID: ${item.id}`);
        return parts.join("\n");
      });

      return {
        content: [{ type: "text" as const, text: `Found ${items.length} item${items.length !== 1 ? "s" : ""}:\n\n${lines.join("\n\n")}` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error searching items: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  },
);

export const GetHouseholdItemTool = CreateTool(
  "get_household_item",
  "Get full details of a specific household item by ID.",
  {
    item_id: z.string().describe("Item ID"),
  },
  async ({ item_id }) => {
    try {
      const response = await getHouseholdItem(item_id);

      if (!response.success || !response.data) {
        return {
          content: [{ type: "text" as const, text: `Item not found: ${response.error || "Unknown error"}` }],
          isError: true,
        };
      }

      const item = response.data;
      const parts = [
        `**${item.name}**`,
        `ID: ${item.id}`,
      ];
      if (item.category) parts.push(`Category: ${item.category}`);
      if (item.location) parts.push(`Location: ${item.location}`);
      if (Object.keys(item.details).length > 0) parts.push(`Details: ${JSON.stringify(item.details, null, 2)}`);
      if (item.notes) parts.push(`Notes: ${item.notes}`);
      parts.push(`Created: ${item.created_at}`);
      parts.push(`Updated: ${item.updated_at}`);

      return { content: [{ type: "text" as const, text: parts.join("\n") }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error getting item: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  },
);

export const AddVendorTool = CreateTool(
  "add_vendor",
  "Add a service provider (plumber, electrician, landscaper, etc.) to the household knowledge base.",
  {
    name: z.string().describe("Vendor name"),
    service_type: z.string().optional().describe("Type of service (e.g. 'plumber', 'electrician', 'landscaper')"),
    phone: z.string().optional().describe("Phone number"),
    email: z.string().optional().describe("Email address"),
    website: z.string().optional().describe("Website URL"),
    notes: z.string().optional().describe("Additional notes"),
    rating: z.number().min(1).max(5).optional().describe("Rating from 1-5"),
    last_used: z.string().optional().describe("Date last used (YYYY-MM-DD format)"),
  },
  async ({ name, service_type, phone, email, website, notes, rating, last_used }) => {
    try {
      const response = await createHouseholdVendor({
        name, service_type, phone, email, website, notes, rating, last_used,
      });

      if (!response.success || !response.data) {
        return {
          content: [{ type: "text" as const, text: `Failed to add vendor: ${response.error || "Unknown error"}` }],
          isError: true,
        };
      }

      const vendor = response.data;
      const parts = [`Added vendor: ${vendor.name} (ID: ${vendor.id})`];
      if (vendor.service_type) parts.push(`Service: ${vendor.service_type}`);
      if (vendor.phone) parts.push(`Phone: ${vendor.phone}`);
      if (vendor.email) parts.push(`Email: ${vendor.email}`);
      if (vendor.rating) parts.push(`Rating: ${"★".repeat(vendor.rating)}${"☆".repeat(5 - vendor.rating)}`);

      return { content: [{ type: "text" as const, text: parts.join("\n") }] };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error adding vendor: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  },
);

export const ListVendorsTool = CreateTool(
  "list_vendors",
  "List service providers, optionally filtered by service type.",
  {
    service_type: z.string().optional().describe("Filter by service type (e.g. 'plumber', 'electrician')"),
  },
  async ({ service_type }) => {
    try {
      const response = await listHouseholdVendors(service_type);

      if (!response.success || !response.data) {
        return {
          content: [{ type: "text" as const, text: `Failed to list vendors: ${response.error || "Unknown error"}` }],
          isError: true,
        };
      }

      const vendors = response.data;
      if (vendors.length === 0) {
        return { content: [{ type: "text" as const, text: "No vendors found." }] };
      }

      const lines = vendors.map((v, i) => {
        const parts = [`${i + 1}. ${v.name}`];
        if (v.service_type) parts[0] += ` [${v.service_type}]`;
        if (v.phone) parts.push(`   Phone: ${v.phone}`);
        if (v.email) parts.push(`   Email: ${v.email}`);
        if (v.rating) parts.push(`   Rating: ${"★".repeat(v.rating)}${"☆".repeat(5 - v.rating)}`);
        if (v.last_used) parts.push(`   Last used: ${v.last_used}`);
        parts.push(`   ID: ${v.id}`);
        return parts.join("\n");
      });

      return {
        content: [{ type: "text" as const, text: `Found ${vendors.length} vendor${vendors.length !== 1 ? "s" : ""}:\n\n${lines.join("\n\n")}` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error listing vendors: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  },
);
