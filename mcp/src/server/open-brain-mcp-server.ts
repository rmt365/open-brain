import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export class OpenBrainMcpServer {
  private static instance: McpServer | null = null;

  private constructor() {}

  public static GetServer(): McpServer {
    if (OpenBrainMcpServer.instance === null) {
      OpenBrainMcpServer.instance = new McpServer({
        name: "Open Brain MCP Server",
        version: "1.0.0",
      });
    }
    return OpenBrainMcpServer.instance;
  }
}
