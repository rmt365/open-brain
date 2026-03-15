// Open Brain - Zod Validation Schemas
// Validation schemas for all POST/PUT request bodies

import { z } from "zod";

// ============================================================
// ENUM SCHEMAS
// ============================================================

export const ThoughtTypeSchema = z.enum([
  "note",
  "idea",
  "task",
  "question",
  "observation",
  "decision",
  "reference",
  "reflection",
]);

export const SourceChannelSchema = z.enum([
  "cli",
  "web",
  "api",
  "mcp",
  "chat",
  "import",
  "telegram",
]);

export const ThoughtStatusSchema = z.enum([
  "active",
  "archived",
  "deleted",
]);

// ============================================================
// THOUGHT SCHEMAS
// ============================================================

export const CaptureThoughtSchema = z.object({
  text: z.string().min(1, "Thought text is required"),
  thought_type: ThoughtTypeSchema.optional(),
  topic: z.string().min(1).optional(),
  source_channel: SourceChannelSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const UpdateThoughtSchema = z.object({
  text: z.string().min(1).optional(),
  thought_type: ThoughtTypeSchema.optional(),
  topic: z.string().min(1).optional(),
  status: ThoughtStatusSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================
// SEARCH & LIST SCHEMAS
// ============================================================

export const SearchThoughtsSchema = z.object({
  query: z.string().min(1, "Search query is required"),
  thought_type: ThoughtTypeSchema.optional(),
  limit: z.number().int().min(1).max(100).default(10),
});

export const ListThoughtsSchema = z.object({
  thought_type: ThoughtTypeSchema.optional(),
  topic: z.string().min(1).optional(),
  source_channel: SourceChannelSchema.optional(),
  since: z.string().datetime().optional(),
  status: ThoughtStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

// ============================================================
// PREFERENCE SCHEMAS
// ============================================================

export const ConstraintTypeSchema = z.enum([
  "domain rule",
  "quality standard",
  "business logic",
  "formatting",
]);

export const CreatePreferenceSchema = z.object({
  preference_name: z.string().min(1, "Preference name is required"),
  domain: z.string().min(1).default("general"),
  reject: z.string().min(1, "Reject description is required"),
  want: z.string().min(1, "Want description is required"),
  constraint_type: ConstraintTypeSchema.default("quality standard"),
});

export const UpdatePreferenceSchema = z.object({
  preference_name: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
  reject: z.string().min(1).optional(),
  want: z.string().min(1).optional(),
  constraint_type: ConstraintTypeSchema.optional(),
});

// ============================================================
// TYPESCRIPT TYPE EXPORTS
// ============================================================

export type CaptureThoughtInput = z.infer<typeof CaptureThoughtSchema>;
export type UpdateThoughtInput = z.infer<typeof UpdateThoughtSchema>;
export type SearchThoughtsInput = z.infer<typeof SearchThoughtsSchema>;
export type ListThoughtsInput = z.infer<typeof ListThoughtsSchema>;
export type CreatePreferenceInput = z.infer<typeof CreatePreferenceSchema>;
export type UpdatePreferenceInput = z.infer<typeof UpdatePreferenceSchema>;
