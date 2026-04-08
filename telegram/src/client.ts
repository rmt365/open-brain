/**
 * Open Brain HTTP Client for Telegram bot.
 * Adapted from open-brain-mcp/src/helpers/open-brain-client.ts for Deno.
 */

// --- Types ---

export interface Thought {
  id: string;
  text: string;
  thought_type: string;
  topic: string | null;
  source_channel: string;
  auto_type: string | null;
  auto_topics: string[] | null;
  confidence: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
}

export interface SearchResult {
  thought: Thought;
  similarity: number;
  rank: number;
}

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

// --- HTTP helpers ---

const API_KEY = Deno.env.get("OPEN_BRAIN_API_KEY") || "";

async function request<T>(baseUrl: string, path: string, options?: RequestInit): Promise<T> {
  const url = `${baseUrl}${path}`;
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

// --- Public API ---

export async function captureThought(
  baseUrl: string,
  text: string,
  metadata: Record<string, unknown>,
): Promise<ApiResponse<Thought>> {
  return request<ApiResponse<Thought>>(baseUrl, "/thoughts", {
    method: "POST",
    body: JSON.stringify({
      text,
      source_channel: "telegram",
      metadata,
    }),
  });
}

export async function searchThoughts(
  baseUrl: string,
  query: string,
  limit?: number,
): Promise<ApiResponse<SearchResult[]>> {
  return request<ApiResponse<SearchResult[]>>(baseUrl, "/thoughts/search", {
    method: "POST",
    body: JSON.stringify({
      query,
      limit: limit ?? 5,
    }),
  });
}

export async function queryBrain(
  baseUrl: string,
  question: string,
  history?: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<ApiResponse<{ answer: string }>> {
  return request<ApiResponse<{ answer: string }>>(baseUrl, "/thoughts/query", {
    method: "POST",
    body: JSON.stringify({ question, history }),
  });
}

export interface TastePreference {
  id: string;
  preference_name: string;
  domain: string;
  reject: string;
  want: string;
  constraint_type: string;
}

export async function extractPreference(
  baseUrl: string,
  text: string,
): Promise<ApiResponse<TastePreference>> {
  return request<ApiResponse<TastePreference>>(baseUrl, "/preferences/extract", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function uploadDocument(
  baseUrl: string,
  fileData: Uint8Array,
  filename: string,
  mimeType: string,
  context?: string,
): Promise<ApiResponse<{ thought_id: string; extraction: Record<string, unknown> | null; wasabi_key: string | null; filename: string }>> {
  const formData = new FormData();
  formData.append("file", new Blob([fileData], { type: mimeType }), filename);
  formData.append("source_channel", "telegram");
  if (context) formData.append("context", context);

  const url = `${baseUrl}/documents/upload`;
  const headers: Record<string, string> = {};
  if (API_KEY) {
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Open Brain API error (${response.status}): ${body}`);
  }

  return response.json();
}

export async function listThoughts(
  baseUrl: string,
  limit?: number,
): Promise<ApiResponse<ListResponse<Thought>>> {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set("limit", String(limit));
  params.set("sort", "desc");

  const qs = params.toString();
  return request<ApiResponse<ListResponse<Thought>>>(baseUrl, `/thoughts${qs ? `?${qs}` : ""}`);
}
