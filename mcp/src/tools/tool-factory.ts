import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import SearchBrainTool from "./search-brain.js";
import CaptureThoughtTool from "./capture-thought.js";
import BrowseRecentTool from "./browse-recent.js";
import BrainStatsTool from "./brain-stats.js";
import FindRelatedTool from "./find-related.js";
import ListTopicsTool from "./list-topics.js";
import GetTasteProfileTool from "./get-taste-profile.js";
import {
  AddHouseholdItemTool,
  SearchHouseholdItemsTool,
  GetHouseholdItemTool,
  AddVendorTool,
  ListVendorsTool,
} from "./household-tools.js";

const AllTools = [
  SearchBrainTool,
  CaptureThoughtTool,
  BrowseRecentTool,
  BrainStatsTool,
  FindRelatedTool,
  ListTopicsTool,
  GetTasteProfileTool,
  AddHouseholdItemTool,
  SearchHouseholdItemsTool,
  GetHouseholdItemTool,
  AddVendorTool,
  ListVendorsTool,
];

export function ToolFactory(server: McpServer) {
  AllTools.map((tool) => tool()).forEach((tool) =>
    server.tool(tool.name, tool.description, tool.schema, tool.handler),
  );
}
