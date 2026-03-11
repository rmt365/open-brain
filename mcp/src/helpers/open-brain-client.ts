/**
 * Open Brain HTTP Client
 * Calls the Open Brain service REST API.
 */

const BASE_URL = process.env.OPEN_BRAIN_URL || "http://localhost:3012";
const API_KEY = process.env.OPEN_BRAIN_API_KEY || "";

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface ListResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

interface Thought {
  id: string;
  text: string;
  thought_type: string;
  topic: string | null;
  source_channel: string;
  auto_type: string | null;
  auto_topics: string[] | null;
  confidence: number | null;
  embedding_model: string | null;
  has_embedding: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
}

interface SearchResult {
  thought: Thought;
  similarity: number;
  rank: number;
}

interface BrainStats {
  total_thoughts: number;
  by_type: Record<string, number>;
  by_channel: Record<string, number>;
  embedded_count: number;
  classified_count: number;
  oldest_thought: string | null;
  newest_thought: string | null;
}

interface TopicEntry {
  topic: string;
  count: number;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (API_KEY) {
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options?.headers as Record<string, string>),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Open Brain API error (${response.status}): ${body}`);
  }

  return response.json() as Promise<T>;
}

export async function captureThought(text: string): Promise<ApiResponse<Thought>> {
  return request<ApiResponse<Thought>>("/thoughts", {
    method: "POST",
    body: JSON.stringify({ text, source_channel: "mcp" }),
  });
}

export async function searchThoughts(
  query: string,
  thoughtType?: string,
  limit?: number,
): Promise<ApiResponse<SearchResult[]>> {
  return request<ApiResponse<SearchResult[]>>("/thoughts/search", {
    method: "POST",
    body: JSON.stringify({
      query,
      thought_type: thoughtType,
      limit: limit ?? 10,
    }),
  });
}

export async function listThoughts(params: {
  thought_type?: string;
  topic?: string;
  since?: string;
  limit?: number;
  offset?: number;
}): Promise<ApiResponse<ListResponse<Thought>>> {
  const searchParams = new URLSearchParams();
  if (params.thought_type) searchParams.set("thought_type", params.thought_type);
  if (params.topic) searchParams.set("topic", params.topic);
  if (params.since) searchParams.set("since", params.since);
  if (params.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params.offset !== undefined) searchParams.set("offset", String(params.offset));

  const qs = searchParams.toString();
  return request<ApiResponse<ListResponse<Thought>>>(`/thoughts${qs ? `?${qs}` : ""}`);
}

export async function getThought(id: string): Promise<ApiResponse<Thought>> {
  return request<ApiResponse<Thought>>(`/thoughts/${id}`);
}

export async function getStats(): Promise<ApiResponse<BrainStats>> {
  return request<ApiResponse<BrainStats>>("/stats");
}

export async function getTopics(
  limit?: number,
  minCount?: number,
): Promise<ApiResponse<TopicEntry[]>> {
  const searchParams = new URLSearchParams();
  if (limit !== undefined) searchParams.set("limit", String(limit));
  if (minCount !== undefined) searchParams.set("min_count", String(minCount));

  const qs = searchParams.toString();
  return request<ApiResponse<TopicEntry[]>>(`/topics${qs ? `?${qs}` : ""}`);
}

export type { Thought, SearchResult, BrainStats, TopicEntry, ApiResponse, ListResponse };
