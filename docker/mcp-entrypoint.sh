#!/bin/sh
set -e
echo "[open-brain-mcp] Starting Open Brain MCP server via supergateway on port ${PORT:-3013} (streamable HTTP, stateful)..."
exec npx supergateway \
  --stdio "node open-brain-mcp/dist/index.js" \
  --port ${PORT:-3013} \
  --outputTransport streamableHttp \
  --stateful \
  --sessionTimeout 300000 \
  --healthEndpoint /health
