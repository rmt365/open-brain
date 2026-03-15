// Household Knowledge extension — REST API routes

import { Hono } from "@hono/hono";
import type { ExtensionContext } from "../types.ts";
import { HouseholdManager } from "./logic.ts";
import {
  CreateItemSchema,
  UpdateItemSchema,
  CreateVendorSchema,
  UpdateVendorSchema,
} from "./schemas.ts";

export function createHouseholdRoutes(ctx: ExtensionContext): Hono {
  const router = new Hono();
  const manager = new HouseholdManager(ctx.db);

  // ============================================
  // Items
  // ============================================

  router.get("/items", (c) => {
    const query = c.req.query("query");
    const category = c.req.query("category");
    const location = c.req.query("location");
    const items = manager.searchItems(query, category, location);
    return c.json({ success: true, data: items, total: items.length });
  });

  router.post("/items", async (c) => {
    const body = await c.req.json();
    const parsed = CreateItemSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, 400);
    }
    const item = manager.createItem(parsed.data);
    return c.json({ success: true, data: item }, 201);
  });

  router.get("/items/:id", (c) => {
    const item = manager.getItem(c.req.param("id"));
    if (!item) return c.json({ success: false, error: "Item not found" }, 404);
    return c.json({ success: true, data: item });
  });

  router.put("/items/:id", async (c) => {
    const body = await c.req.json();
    const parsed = UpdateItemSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, 400);
    }
    const item = manager.updateItem(c.req.param("id"), parsed.data);
    if (!item) return c.json({ success: false, error: "Item not found" }, 404);
    return c.json({ success: true, data: item });
  });

  router.delete("/items/:id", (c) => {
    const deleted = manager.deleteItem(c.req.param("id"));
    if (!deleted) return c.json({ success: false, error: "Item not found" }, 404);
    return c.json({ success: true });
  });

  // ============================================
  // Vendors
  // ============================================

  router.get("/vendors", (c) => {
    const serviceType = c.req.query("service_type");
    const vendors = manager.listVendors(serviceType);
    return c.json({ success: true, data: vendors, total: vendors.length });
  });

  router.post("/vendors", async (c) => {
    const body = await c.req.json();
    const parsed = CreateVendorSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, 400);
    }
    const vendor = manager.createVendor(parsed.data);
    return c.json({ success: true, data: vendor }, 201);
  });

  router.get("/vendors/:id", (c) => {
    const vendor = manager.getVendor(c.req.param("id"));
    if (!vendor) return c.json({ success: false, error: "Vendor not found" }, 404);
    return c.json({ success: true, data: vendor });
  });

  router.put("/vendors/:id", async (c) => {
    const body = await c.req.json();
    const parsed = UpdateVendorSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, 400);
    }
    const vendor = manager.updateVendor(c.req.param("id"), parsed.data);
    if (!vendor) return c.json({ success: false, error: "Vendor not found" }, 404);
    return c.json({ success: true, data: vendor });
  });

  router.delete("/vendors/:id", (c) => {
    const deleted = manager.deleteVendor(c.req.param("id"));
    if (!deleted) return c.json({ success: false, error: "Vendor not found" }, 404);
    return c.json({ success: true });
  });

  return router;
}
