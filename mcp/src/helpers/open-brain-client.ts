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
  life_area: string | null;
  auto_life_area: string | null;
  source_channel: string;
  auto_type: string | null;
  auto_topics: string[] | null;
  confidence: number | null;
  auto_people: string[] | null;
  auto_action_items: string[] | null;
  auto_dates_mentioned: string[] | null;
  auto_sentiment: string | null;
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
  return request<ApiResponse<BrainStats>>("/thoughts/stats");
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

export async function getPreferencesBlock(
  domain?: string,
): Promise<ApiResponse<{ block: string }>> {
  const searchParams = new URLSearchParams();
  if (domain) searchParams.set("domain", domain);

  const qs = searchParams.toString();
  return request<ApiResponse<{ block: string }>>(`/preferences/block${qs ? `?${qs}` : ""}`);
}

// ============================================================
// TOPIC MANAGEMENT
// ============================================================

interface ManagedTopic {
  id: number;
  name: string;
  life_area: string | null;
  created_at: string;
  active: boolean;
}

interface SuggestedTopic {
  id: number;
  name: string;
  suggested_from_thought_id: string | null;
  status: string;
  created_at: string;
}

export async function getManagedTopics(): Promise<ApiResponse<ManagedTopic[]>> {
  return request<ApiResponse<ManagedTopic[]>>("/topics");
}

export async function getPendingSuggestions(): Promise<ApiResponse<SuggestedTopic[]>> {
  return request<ApiResponse<SuggestedTopic[]>>("/topics/suggestions");
}

export async function approveSuggestion(
  id: number,
  lifeArea?: string,
): Promise<ApiResponse<ManagedTopic>> {
  const searchParams = new URLSearchParams();
  if (lifeArea) searchParams.set("life_area", lifeArea);
  const qs = searchParams.toString();
  return request<ApiResponse<ManagedTopic>>(`/topics/suggestions/${id}/approve${qs ? `?${qs}` : ""}`, {
    method: "POST",
  });
}

export async function rejectSuggestion(
  id: number,
): Promise<ApiResponse<unknown>> {
  return request<ApiResponse<unknown>>(`/topics/suggestions/${id}/reject`, {
    method: "POST",
  });
}

// ============================================================
// URL INGESTION
// ============================================================

export async function ingestUrl(
  url: string,
  lifeArea?: string,
): Promise<ApiResponse<Thought>> {
  return request<ApiResponse<Thought>>("/thoughts/ingest", {
    method: "POST",
    body: JSON.stringify({ url, life_area: lifeArea }),
  });
}

// ============================================================
// SURFACING FORGOTTEN THOUGHTS
// ============================================================

export async function getForgottenThoughts(
  minAgeDays?: number,
  limit?: number,
  lifeArea?: string,
): Promise<ApiResponse<Thought[]>> {
  const searchParams = new URLSearchParams();
  if (minAgeDays !== undefined) searchParams.set("min_age_days", String(minAgeDays));
  if (limit !== undefined) searchParams.set("limit", String(limit));
  if (lifeArea) searchParams.set("life_area", lifeArea);

  const qs = searchParams.toString();
  return request<ApiResponse<Thought[]>>(`/thoughts/forgotten${qs ? `?${qs}` : ""}`);
}

// ============================================
// Household extension
// ============================================

interface HouseholdItem {
  id: string;
  name: string;
  category: string | null;
  location: string | null;
  details: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface HouseholdVendor {
  id: string;
  name: string;
  service_type: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
  rating: number | null;
  last_used: string | null;
  created_at: string;
}

export async function createHouseholdItem(data: {
  name: string;
  category?: string;
  location?: string;
  details?: Record<string, unknown>;
  notes?: string;
}): Promise<ApiResponse<HouseholdItem>> {
  return request<ApiResponse<HouseholdItem>>("/ext/household/items", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function searchHouseholdItems(
  query?: string,
  category?: string,
  location?: string,
): Promise<ApiResponse<HouseholdItem[]>> {
  const searchParams = new URLSearchParams();
  if (query) searchParams.set("query", query);
  if (category) searchParams.set("category", category);
  if (location) searchParams.set("location", location);

  const qs = searchParams.toString();
  return request<ApiResponse<HouseholdItem[]>>(`/ext/household/items${qs ? `?${qs}` : ""}`);
}

export async function getHouseholdItem(id: string): Promise<ApiResponse<HouseholdItem>> {
  return request<ApiResponse<HouseholdItem>>(`/ext/household/items/${id}`);
}

export async function createHouseholdVendor(data: {
  name: string;
  service_type?: string;
  phone?: string;
  email?: string;
  website?: string;
  notes?: string;
  rating?: number;
  last_used?: string;
}): Promise<ApiResponse<HouseholdVendor>> {
  return request<ApiResponse<HouseholdVendor>>("/ext/household/vendors", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listHouseholdVendors(
  serviceType?: string,
): Promise<ApiResponse<HouseholdVendor[]>> {
  const searchParams = new URLSearchParams();
  if (serviceType) searchParams.set("service_type", serviceType);

  const qs = searchParams.toString();
  return request<ApiResponse<HouseholdVendor[]>>(`/ext/household/vendors${qs ? `?${qs}` : ""}`);
}

export type { Thought, SearchResult, BrainStats, TopicEntry, ManagedTopic, SuggestedTopic, ApiResponse, ListResponse, HouseholdItem, HouseholdVendor };
