// Household Knowledge extension — business logic

import type { OpenBrainDatabaseManager } from "../../db/openBrainDatabaseManager.ts";
import type { HouseholdItem, HouseholdVendor } from "./types.ts";

export class HouseholdManager {
  private db: OpenBrainDatabaseManager;

  constructor(db: OpenBrainDatabaseManager) {
    this.db = db;
  }

  // ============================================
  // Items
  // ============================================

  createItem(data: {
    name: string;
    category?: string;
    location?: string;
    details?: Record<string, unknown>;
    notes?: string;
  }): HouseholdItem {
    const id = crypto.randomUUID();
    const raw = this.db.getRawDb();
    const stmt = raw.prepare(
      `INSERT INTO household_items (id, name, category, location, details, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      id,
      data.name,
      data.category ?? null,
      data.location ?? null,
      JSON.stringify(data.details ?? {}),
      data.notes ?? null,
    );
    return this.getItem(id)!;
  }

  getItem(id: string): HouseholdItem | null {
    const raw = this.db.getRawDb();
    const stmt = raw.prepare("SELECT * FROM household_items WHERE id = ?");
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.parseItemRow(row);
  }

  searchItems(query?: string, category?: string, location?: string): HouseholdItem[] {
    const raw = this.db.getRawDb();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (category) {
      conditions.push("category LIKE ?");
      params.push(`%${category}%`);
    }
    if (location) {
      conditions.push("location LIKE ?");
      params.push(`%${location}%`);
    }
    if (query) {
      conditions.push("(name LIKE ? OR category LIKE ? OR location LIKE ? OR notes LIKE ?)");
      params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `SELECT * FROM household_items ${where} ORDER BY created_at DESC`;
    const stmt = raw.prepare(sql);
    const rows = stmt.all(...params) as Record<string, unknown>[];
    return rows.map((r) => this.parseItemRow(r));
  }

  updateItem(id: string, data: {
    name?: string;
    category?: string | null;
    location?: string | null;
    details?: Record<string, unknown>;
    notes?: string | null;
  }): HouseholdItem | null {
    const existing = this.getItem(id);
    if (!existing) return null;

    const raw = this.db.getRawDb();
    const sets: string[] = [];
    const params: unknown[] = [];

    if (data.name !== undefined) { sets.push("name = ?"); params.push(data.name); }
    if (data.category !== undefined) { sets.push("category = ?"); params.push(data.category); }
    if (data.location !== undefined) { sets.push("location = ?"); params.push(data.location); }
    if (data.details !== undefined) { sets.push("details = ?"); params.push(JSON.stringify(data.details)); }
    if (data.notes !== undefined) { sets.push("notes = ?"); params.push(data.notes); }

    if (sets.length === 0) return existing;

    sets.push("updated_at = CURRENT_TIMESTAMP");
    params.push(id);
    const stmt = raw.prepare(`UPDATE household_items SET ${sets.join(", ")} WHERE id = ?`);
    stmt.run(...params);
    return this.getItem(id);
  }

  deleteItem(id: string): boolean {
    const raw = this.db.getRawDb();
    const stmt = raw.prepare("DELETE FROM household_items WHERE id = ?");
    const result = stmt.run(id);
    return result > 0;
  }

  // ============================================
  // Vendors
  // ============================================

  createVendor(data: {
    name: string;
    service_type?: string;
    phone?: string;
    email?: string;
    website?: string;
    notes?: string;
    rating?: number;
    last_used?: string;
  }): HouseholdVendor {
    const id = crypto.randomUUID();
    const raw = this.db.getRawDb();
    const stmt = raw.prepare(
      `INSERT INTO household_vendors (id, name, service_type, phone, email, website, notes, rating, last_used)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      id,
      data.name,
      data.service_type ?? null,
      data.phone ?? null,
      data.email ?? null,
      data.website ?? null,
      data.notes ?? null,
      data.rating ?? null,
      data.last_used ?? null,
    );
    return this.getVendor(id)!;
  }

  getVendor(id: string): HouseholdVendor | null {
    const raw = this.db.getRawDb();
    const stmt = raw.prepare("SELECT * FROM household_vendors WHERE id = ?");
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.parseVendorRow(row);
  }

  listVendors(serviceType?: string): HouseholdVendor[] {
    const raw = this.db.getRawDb();
    let sql = "SELECT * FROM household_vendors";
    const params: unknown[] = [];

    if (serviceType) {
      sql += " WHERE service_type LIKE ?";
      params.push(`%${serviceType}%`);
    }

    sql += " ORDER BY name ASC";
    const stmt = raw.prepare(sql);
    const rows = stmt.all(...params) as Record<string, unknown>[];
    return rows.map((r) => this.parseVendorRow(r));
  }

  updateVendor(id: string, data: {
    name?: string;
    service_type?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    notes?: string | null;
    rating?: number | null;
    last_used?: string | null;
  }): HouseholdVendor | null {
    const existing = this.getVendor(id);
    if (!existing) return null;

    const raw = this.db.getRawDb();
    const sets: string[] = [];
    const params: unknown[] = [];

    if (data.name !== undefined) { sets.push("name = ?"); params.push(data.name); }
    if (data.service_type !== undefined) { sets.push("service_type = ?"); params.push(data.service_type); }
    if (data.phone !== undefined) { sets.push("phone = ?"); params.push(data.phone); }
    if (data.email !== undefined) { sets.push("email = ?"); params.push(data.email); }
    if (data.website !== undefined) { sets.push("website = ?"); params.push(data.website); }
    if (data.notes !== undefined) { sets.push("notes = ?"); params.push(data.notes); }
    if (data.rating !== undefined) { sets.push("rating = ?"); params.push(data.rating); }
    if (data.last_used !== undefined) { sets.push("last_used = ?"); params.push(data.last_used); }

    if (sets.length === 0) return existing;

    params.push(id);
    const stmt = raw.prepare(`UPDATE household_vendors SET ${sets.join(", ")} WHERE id = ?`);
    stmt.run(...params);
    return this.getVendor(id);
  }

  deleteVendor(id: string): boolean {
    const raw = this.db.getRawDb();
    const stmt = raw.prepare("DELETE FROM household_vendors WHERE id = ?");
    const result = stmt.run(id);
    return result > 0;
  }

  // ============================================
  // Row parsers
  // ============================================

  private parseItemRow(row: Record<string, unknown>): HouseholdItem {
    let details: Record<string, unknown> = {};
    if (typeof row.details === "string") {
      try { details = JSON.parse(row.details); } catch { /* keep default */ }
    }
    return {
      id: row.id as string,
      name: row.name as string,
      category: (row.category as string) || null,
      location: (row.location as string) || null,
      details,
      notes: (row.notes as string) || null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  private parseVendorRow(row: Record<string, unknown>): HouseholdVendor {
    return {
      id: row.id as string,
      name: row.name as string,
      service_type: (row.service_type as string) || null,
      phone: (row.phone as string) || null,
      email: (row.email as string) || null,
      website: (row.website as string) || null,
      notes: (row.notes as string) || null,
      rating: row.rating != null ? Number(row.rating) : null,
      last_used: (row.last_used as string) || null,
      created_at: row.created_at as string,
    };
  }
}
