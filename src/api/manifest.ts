// Open Brain - Service Manifest
// Defines available tools/actions for the workflow system

// deno-lint-ignore no-explicit-any
type ServiceManifest = Record<string, any>;

/**
 * Get the base URL for this service
 */
function getBaseUrl(): string {
  const host = Deno.env.get("SERVICE_HOST") || "localhost";
  const port = Deno.env.get("PORT") || "3012";
  return `http://${host}:${port}`;
}

/**
 * Open Brain Service Manifest
 * Defines available tools/actions for the workflow system
 */
export const OPEN_BRAIN_MANIFEST: ServiceManifest = {
  serviceId: "open-brain",
  name: "Open Brain - Personal Knowledge Management",
  version: "1.0.0",
  baseUrl: getBaseUrl(),

  tools: [
    // ============================================================
    // THOUGHT CAPTURE & MANAGEMENT
    // ============================================================
    {
      name: "open-brain.thought.capture",
      description: "Capture a new thought, note, idea, or observation",
      endpoint: "/thoughts",
      method: "POST",
      inputSchema: {
        type: "object",
        required: ["text"],
        properties: {
          text: {
            type: "string",
            description: "The thought content to capture",
          },
          thought_type: {
            type: "string",
            enum: ["note", "idea", "task", "question", "observation", "decision", "reference", "reflection"],
            description: "Type of thought (auto-classified if omitted)",
          },
          topic: {
            type: "string",
            description: "Optional topic/category for the thought",
          },
          source_channel: {
            type: "string",
            enum: ["cli", "web", "api", "mcp", "chat", "import"],
            description: "Channel through which the thought was captured",
          },
          metadata: {
            type: "object",
            description: "Additional metadata for the thought",
          },
        },
      },
    },
    {
      name: "open-brain.thought.get",
      description: "Get a specific thought by ID",
      endpoint: "/thoughts/{thought_id}",
      method: "GET",
      inputSchema: {
        type: "object",
        required: ["thought_id"],
        properties: {
          thought_id: {
            type: "string",
            description: "The unique ID of the thought",
          },
        },
      },
    },
    {
      name: "open-brain.thought.list",
      description: "List thoughts with optional filtering by type, topic, channel, and date",
      endpoint: "/thoughts",
      method: "GET",
      inputSchema: {
        type: "object",
        properties: {
          thought_type: {
            type: "string",
            enum: ["note", "idea", "task", "question", "observation", "decision", "reference", "reflection"],
            description: "Filter by thought type",
          },
          topic: {
            type: "string",
            description: "Filter by topic",
          },
          source_channel: {
            type: "string",
            enum: ["cli", "web", "api", "mcp", "chat", "import"],
            description: "Filter by source channel",
          },
          since: {
            type: "string",
            description: "Filter by created date (ISO format, only thoughts after this date)",
          },
          status: {
            type: "string",
            enum: ["active", "archived", "deleted"],
            description: "Filter by status (defaults to active)",
          },
          limit: {
            type: "number",
            default: 50,
            description: "Maximum number of thoughts to return",
          },
          offset: {
            type: "number",
            default: 0,
            description: "Number of thoughts to skip (pagination)",
          },
        },
      },
    },
    {
      name: "open-brain.thought.update",
      description: "Update a thought's content, type, topic, or status",
      endpoint: "/thoughts/{thought_id}",
      method: "PUT",
      inputSchema: {
        type: "object",
        required: ["thought_id"],
        properties: {
          thought_id: {
            type: "string",
            description: "The unique ID of the thought",
          },
          text: {
            type: "string",
            description: "Updated thought content",
          },
          thought_type: {
            type: "string",
            enum: ["note", "idea", "task", "question", "observation", "decision", "reference", "reflection"],
            description: "Updated thought type",
          },
          topic: {
            type: "string",
            description: "Updated topic",
          },
          status: {
            type: "string",
            enum: ["active", "archived", "deleted"],
            description: "Updated status",
          },
          metadata: {
            type: "object",
            description: "Updated metadata",
          },
        },
      },
    },

    // ============================================================
    // SEMANTIC SEARCH
    // ============================================================
    {
      name: "open-brain.thought.search",
      description: "Semantically search thoughts using natural language query",
      endpoint: "/thoughts/search",
      method: "POST",
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: {
          query: {
            type: "string",
            description: "Natural language search query",
          },
          thought_type: {
            type: "string",
            enum: ["note", "idea", "task", "question", "observation", "decision", "reference", "reflection"],
            description: "Filter results by thought type",
          },
          limit: {
            type: "number",
            default: 10,
            description: "Maximum number of results to return",
          },
        },
      },
    },

    // ============================================================
    // STATS
    // ============================================================
    {
      name: "open-brain.stats",
      description: "Get brain statistics: thought counts by type, channel, embedding and classification coverage",
      endpoint: "/stats",
      method: "GET",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],

  resources: [
    {
      type: "thought",
      description: "A captured thought, note, idea, or observation",
      schema: {
        type: "object",
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          thought_type: { type: "string" },
          topic: { type: "string" },
          status: { type: "string" },
        },
      },
      operations: ["capture", "get", "list", "update", "search"],
    },
  ],

  events: [
    {
      name: "thought.captured",
      description: "Emitted when a new thought is captured",
      payloadSchema: {
        type: "object",
        properties: {
          thought_id: { type: "string" },
          thought_type: { type: "string" },
          source_channel: { type: "string" },
        },
      },
    },
    {
      name: "thought.embedded",
      description: "Emitted when a thought has been embedded for semantic search",
      payloadSchema: {
        type: "object",
        properties: {
          thought_id: { type: "string" },
          embedding_model: { type: "string" },
        },
      },
    },
    {
      name: "thought.classified",
      description: "Emitted when a thought has been auto-classified by AI",
      payloadSchema: {
        type: "object",
        properties: {
          thought_id: { type: "string" },
          auto_type: { type: "string" },
          auto_topics: { type: "array" },
          confidence: { type: "number" },
        },
      },
    },
  ],

  permissions: {
    default: ["authenticated"],
    tools: {
      "open-brain.thought.capture": ["authenticated", "open-brain:write"],
      "open-brain.thought.update": ["authenticated", "open-brain:write"],
      "open-brain.thought.search": ["authenticated", "open-brain:read"],
    },
  },

  metadata: {
    maintainer: "P2B Platform Team",
    documentation: "https://docs.p2b.internal/services/open-brain",
    tags: ["knowledge", "notes", "semantic-search", "personal-knowledge-management"],
  },
};

/**
 * Get manifest function for backwards compatibility
 */
export function getManifest(): ServiceManifest {
  return OPEN_BRAIN_MANIFEST as ServiceManifest;
}
