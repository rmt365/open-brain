// Open Brain - Type Definitions
// TypeScript interfaces for thoughts, search, and knowledge management

// ============================================================
// ENUMS & CONSTANTS
// ============================================================

export type ThoughtType =
  | "note"
  | "idea"
  | "task"
  | "question"
  | "observation"
  | "decision"
  | "reference"
  | "reflection";

export type SourceChannel =
  | "cli"
  | "web"
  | "api"
  | "mcp"
  | "chat"
  | "import"
  | "telegram";

export type ThoughtStatus =
  | "active"
  | "archived"
  | "deleted";

// ============================================================
// THOUGHT TYPES
// ============================================================

export interface Thought {
  id: string;

  // Core content
  text: string;
  thought_type: ThoughtType;
  topic: string | null;

  // Source tracking
  source_channel: SourceChannel;

  // Classification (AI-assigned)
  auto_type: ThoughtType | null;
  auto_topics: string[] | null;
  confidence: number | null;

  // Embedding
  embedding_model: string | null;
  has_embedding: boolean;

  // Status
  status: ThoughtStatus;

  // Timestamps
  created_at: string;
  updated_at: string;

  // Metadata
  metadata: Record<string, unknown> | null;
}

// ============================================================
// SEARCH TYPES
// ============================================================

export interface SearchResult {
  thought: Thought;
  similarity: number;
  rank: number;
}

// ============================================================
// STATS TYPES
// ============================================================

export interface BrainStats {
  total_thoughts: number;
  by_type: Record<ThoughtType, number>;
  by_channel: Record<SourceChannel, number>;
  embedded_count: number;
  classified_count: number;
  oldest_thought: string | null;
  newest_thought: string | null;
}

// ============================================================
// REQUEST TYPES
// ============================================================

export interface CaptureThoughtRequest {
  text: string;
  thought_type?: ThoughtType;
  topic?: string;
  source_channel?: SourceChannel;
  metadata?: Record<string, unknown>;
}

export interface UpdateThoughtRequest {
  text?: string;
  thought_type?: ThoughtType;
  topic?: string;
  status?: ThoughtStatus;
  metadata?: Record<string, unknown>;
}

export interface SearchThoughtsRequest {
  query: string;
  thought_type?: ThoughtType;
  limit?: number;
}

export interface ListThoughtsRequest {
  thought_type?: ThoughtType;
  topic?: string;
  source_channel?: SourceChannel;
  since?: string;
  status?: ThoughtStatus;
  limit?: number;
  offset?: number;
}

// ============================================================
// API RESPONSE TYPES
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ListResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// ============================================================
// SERVICE MANIFEST TYPES
// ============================================================

export interface ServiceManifest {
  service: string;
  version: string;
  description: string;
  tools: ManifestTool[];
}

export interface ManifestTool {
  name: string;
  description: string;
  endpoint: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  inputSchema: {
    type: "object";
    required?: string[];
    properties: Record<string, unknown>;
  };
}
