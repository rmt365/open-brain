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

export const LifeAreaSchema = z.string().min(1);

// ============================================================
// THOUGHT SCHEMAS
// ============================================================

export const CaptureThoughtSchema = z.object({
  text: z.string().min(1, "Thought text is required"),
  thought_type: ThoughtTypeSchema.optional(),
  topic: z.string().min(1).optional(),
  life_area: LifeAreaSchema.optional(),
  source_channel: SourceChannelSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const UpdateThoughtSchema = z.object({
  text: z.string().min(1).optional(),
  thought_type: ThoughtTypeSchema.optional(),
  topic: z.string().min(1).optional(),
  life_area: LifeAreaSchema.optional(),
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

export const QueryBrainSchema = z.object({
  question: z.string().min(1, "Question is required"),
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

export const PreferenceFormatSchema = z.enum(["rule", "block"]);

export const ArtifactTypeSchema = z.enum([
  "claude-md",
  "mcp-server",
  "sub-agent",
  "settings",
  "hook",
  "tool-config",
]);

export const CreatePreferenceSchema = z.object({
  preference_name: z.string().min(1, "Preference name is required"),
  domain: z.string().min(1).default("general"),
  format: PreferenceFormatSchema.default("rule"),
  reject: z.string().optional(),
  want: z.string().optional(),
  content: z.string().optional(),
  constraint_type: ConstraintTypeSchema.default("quality standard"),
  artifact_type: ArtifactTypeSchema.optional(),
  purpose: z.string().min(1).optional(),
}).refine(
  (d) => d.format === "block" ? !!d.content : (!!d.reject && !!d.want),
  { message: "Rules require reject+want; blocks require content" },
);

export const ExtractPreferenceSchema = z.object({
  text: z.string().min(1, "Preference text is required"),
});

export const UpdatePreferenceSchema = z.object({
  preference_name: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
  reject: z.string().min(1).optional(),
  want: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  constraint_type: ConstraintTypeSchema.optional(),
  artifact_type: ArtifactTypeSchema.optional(),
  purpose: z.string().min(1).optional(),
});

// ============================================================
// URL INGESTION SCHEMAS
// ============================================================

export const IngestUrlSchema = z.object({
  url: z.string().url("Valid URL is required"),
  life_area: LifeAreaSchema.optional(),
});

// ============================================================
// TOPIC MANAGEMENT SCHEMAS
// ============================================================

export const CreateManagedTopicSchema = z.object({
  name: z.string().min(1, "Topic name is required").transform(s => s.toLowerCase().trim()),
  life_area: LifeAreaSchema.optional(),
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
export type ExtractPreferenceInput = z.infer<typeof ExtractPreferenceSchema>;
export type CreateManagedTopicInput = z.infer<typeof CreateManagedTopicSchema>;
