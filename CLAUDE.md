# CLAUDE.md — Open Brain

## Overview

Open Brain is a personal knowledge management service. It captures thoughts, classifies them with AI, generates embeddings for semantic search, and exposes them via REST API and MCP protocol.

**Architecture:** Deno service + Node.js MCP sidecar + optional Telegram bot

## Project Structure

```
open-brain/                    (repo root)
  src/                         # Main Deno service
    main.ts                    # Entry point (bootstraps with Litestream)
    server.ts                  # Hono HTTP server
    config.ts                  # Service configuration
    routes/thoughts.ts         # API routes
    logic/                     # Business logic (ThoughtManager, embeddings, classifier)
    db/                        # Database manager + migrations
    middleware/auth.ts          # API key auth
    prompts/                   # YAML prompt templates
    ui/                        # PWA chat interface (Lit web components)
    tests/                     # Tests
  packages/                    # Vendored shared packages (from P2B)
    db-core/                   # BaseDatabaseManager
    db-backup/                 # Litestream, health checks, bootstrap
    hono-core/                 # Error handler, prompt loader, validation
  telegram/                    # Telegram bot (separate Deno service)
  mcp/                         # Node.js MCP server (stdio)
  docker/                      # Dockerfiles + entrypoints
  deploy/                      # Multi-instance deployment (ob-ctl, templates)
  docs/
    SERVICE.md                 # Comprehensive service documentation
    BACKLOG.md                 # Feature backlog
```

## Ports

| Service | Port | Description |
|---------|------|-------------|
| Open Brain | 3012 | HTTP API + PWA UI |
| MCP Server | 3013 | MCP via supergateway (streamable HTTP) |
| Ollama | 11434 | Local embedding model |

## Development Commands

```bash
# Local dev (needs Ollama running)
deno task dev

# Type check + lint + tests
deno task verify

# Docker (full stack with Ollama)
docker compose up -d --build
docker exec open-brain-ollama-1 ollama pull all-minilm

# Build individual images
docker build -f docker/Dockerfile .
docker build -f docker/Dockerfile.mcp .
docker build -f docker/Dockerfile.telegram .
```

## Environment Variables

```bash
PORT=3012
DATABASE_PATH=/app/database/open-brain.db
OLLAMA_URL=http://localhost:11434
EMBEDDING_MODEL=all-minilm
ANTHROPIC_API_KEY=...          # For thought classification
OPEN_BRAIN_API_KEY=...         # Optional API key auth
ENABLE_LITESTREAM=false        # Enable backup replication
```

## Key Design Principles

- **Graceful degradation:** Thoughts always captured even if Ollama/Anthropic are down
- **VSS embeddings:** 384-dim vectors via sqlite-vss for semantic search
- **MCP-native:** Primary interface for AI agents is the MCP server
- **PWA:** Offline-capable chat UI with service worker queuing

## Vendored Packages

Three packages vendored from the P2B monorepo in `packages/`. They are small and stable — Open Brain uses minimal surface area. They may diverge from the P2B versions over time.

- `@p2b/db-core` — `BaseDatabaseManager` for SQLite
- `@p2b/db-backup` — `bootstrapService()`, Litestream, health checks
- `@p2b/hono-core` — `globalErrorHandler`, `validateJson`, `PromptLoader`

## Don't Do This

- **NEVER use React** — Lit web components only
- Don't hardcode file paths — use env vars
- Don't skip `deno task verify` before committing
