import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import SearchBrainTool from "./search-brain.js";
import CaptureTool from "./capture.js";
import ExploreTool from "./explore.js";
import HouseholdTool from "./household.js";
import TopicsTool from "./topics.js";

const AllTools = [
  SearchBrainTool,
  CaptureTool,
  ExploreTool,
  HouseholdTool,
  TopicsTool,
];

export function ToolFactory(server: McpServer) {
  AllTools.map((tool) => tool()).forEach((tool) =>
    server.tool(tool.name, tool.description, tool.schema, tool.handler),
  );
}
