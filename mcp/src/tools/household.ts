import { z } from "zod";
import { CreateCompoundTool, textResult } from "../helpers/create-compound-tool.js";
import {
  createHouseholdItem,
  searchHouseholdItems,
  getHouseholdItem,
  createHouseholdVendor,
  listHouseholdVendors,
} from "../helpers/open-brain-client.js";

const HouseholdTool = CreateCompoundTool(
  "household",
  "Manage household items (paint colors, appliances, measurements) and service vendors (plumber, electrician, etc.).",
  {
    add_item: {
      description: "Add a household item (requires name)",
      required: ["name"],
      handler: async (args) => {
        let parsedDetails: Record<string, unknown> = {};
        if (args.details) {
          try { parsedDetails = JSON.parse(args.details as string); } catch { /* keep empty */ }
        }

        const response = await createHouseholdItem({
          name: args.name as string,
          category: args.category as string | undefined,
          location: args.location as string | undefined,
          details: parsedDetails,
          notes: args.notes as string | undefined,
        });

        if (!response.success || !response.data) {
          return textResult(`Failed to add item: ${response.error || "Unknown error"}`, true);
        }

        const item = response.data;
        const parts = [`Added household item: ${item.name} (ID: ${item.id})`];
        if (item.category) parts.push(`Category: ${item.category}`);
        if (item.location) parts.push(`Location: ${item.location}`);
        if (Object.keys(item.details).length > 0) parts.push(`Details: ${JSON.stringify(item.details)}`);
        if (item.notes) parts.push(`Notes: ${item.notes}`);

        return textResult(parts.join("\n"));
      },
    },
    search_items: {
      description: "Search household items by name, category, or location",
      handler: async (args) => {
        const response = await searchHouseholdItems(
          args.query as string | undefined,
          args.category as string | undefined,
          args.location as string | undefined,
        );

        if (!response.success || !response.data) {
          return textResult(`Search failed: ${response.error || "Unknown error"}`, true);
        }

        const items = response.data;
        if (items.length === 0) {
          return textResult("No household items found matching your search.");
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

        return textResult(`Found ${items.length} item${items.length !== 1 ? "s" : ""}:\n\n${lines.join("\n\n")}`);
      },
    },
    get_item: {
      description: "Get full details of a specific household item (requires item_id)",
      required: ["item_id"],
      handler: async (args) => {
        const response = await getHouseholdItem(args.item_id as string);

        if (!response.success || !response.data) {
          return textResult(`Item not found: ${response.error || "Unknown error"}`, true);
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

        return textResult(parts.join("\n"));
      },
    },
    add_vendor: {
      description: "Add a service provider (requires vendor_name)",
      required: ["vendor_name"],
      handler: async (args) => {
        const response = await createHouseholdVendor({
          name: args.vendor_name as string,
          service_type: args.service_type as string | undefined,
          phone: args.phone as string | undefined,
          email: args.email as string | undefined,
          website: args.website as string | undefined,
          notes: args.notes as string | undefined,
          rating: args.rating as number | undefined,
          last_used: args.last_used as string | undefined,
        });

        if (!response.success || !response.data) {
          return textResult(`Failed to add vendor: ${response.error || "Unknown error"}`, true);
        }

        const vendor = response.data;
        const parts = [`Added vendor: ${vendor.name} (ID: ${vendor.id})`];
        if (vendor.service_type) parts.push(`Service: ${vendor.service_type}`);
        if (vendor.phone) parts.push(`Phone: ${vendor.phone}`);
        if (vendor.email) parts.push(`Email: ${vendor.email}`);
        if (vendor.rating) parts.push(`Rating: ${"★".repeat(vendor.rating)}${"☆".repeat(5 - vendor.rating)}`);

        return textResult(parts.join("\n"));
      },
    },
    list_vendors: {
      description: "List service providers, optionally filtered by service type",
      handler: async (args) => {
        const response = await listHouseholdVendors(args.service_type as string | undefined);

        if (!response.success || !response.data) {
          return textResult(`Failed to list vendors: ${response.error || "Unknown error"}`, true);
        }

        const vendors = response.data;
        if (vendors.length === 0) {
          return textResult("No vendors found.");
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

        return textResult(`Found ${vendors.length} vendor${vendors.length !== 1 ? "s" : ""}:\n\n${lines.join("\n\n")}`);
      },
    },
  },
  {
    name: z.string().optional().describe("Item name (for action: add_item)"),
    category: z.string().optional().describe("Category e.g. 'paint', 'appliance' (for add_item/search_items)"),
    location: z.string().optional().describe("Location in the home (for add_item/search_items)"),
    details: z.string().optional().describe("Flexible metadata as JSON string (for action: add_item)"),
    notes: z.string().optional().describe("Additional notes (for add_item/add_vendor)"),
    query: z.string().optional().describe("Search term (for action: search_items)"),
    item_id: z.string().optional().describe("Item ID (for action: get_item)"),
    vendor_name: z.string().optional().describe("Vendor name (for action: add_vendor)"),
    service_type: z.string().optional().describe("Service type e.g. 'plumber' (for add_vendor/list_vendors)"),
    phone: z.string().optional().describe("Phone number (for action: add_vendor)"),
    email: z.string().optional().describe("Email address (for action: add_vendor)"),
    website: z.string().optional().describe("Website URL (for action: add_vendor)"),
    rating: z.number().min(1).max(5).optional().describe("Rating 1-5 (for action: add_vendor)"),
    last_used: z.string().optional().describe("Date last used YYYY-MM-DD (for action: add_vendor)"),
  },
);

export default HouseholdTool;
