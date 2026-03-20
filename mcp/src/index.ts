#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { OpenBrainMcpServer } from "./server/open-brain-mcp-server.js";
import { ToolFactory } from "./tools/tool-factory.js";
import { registerPreferencesResource } from "./resources/preferences-resource.js";
import { registerStatsResource } from "./resources/stats-resource.js";

const main = async () => {
  // Create an MCP server
  const server = OpenBrainMcpServer.GetServer();

  ToolFactory(server);
  registerPreferencesResource(server);
  registerStatsResource(server);

  // Start receiving messages on stdin and sending messages on stdout
  const transport = new StdioServerTransport();
  await server.connect(transport);
};

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
