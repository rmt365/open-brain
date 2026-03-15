// Household Knowledge extension — Zod validation schemas

import { z } from "npm:zod@3";

export const CreateItemSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  location: z.string().optional(),
  details: z.record(z.unknown()).optional().default({}),
  notes: z.string().optional(),
});

export const UpdateItemSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  details: z.record(z.unknown()).optional(),
  notes: z.string().nullable().optional(),
});

export const CreateVendorSchema = z.object({
  name: z.string().min(1),
  service_type: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  last_used: z.string().optional(),
});

export const UpdateVendorSchema = z.object({
  name: z.string().min(1).optional(),
  service_type: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  last_used: z.string().nullable().optional(),
});
