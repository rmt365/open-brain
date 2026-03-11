import { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";

export interface ToolDefinition<
  Args extends undefined | ZodRawShapeCompat = undefined,
> {
  name: string;
  description: string;
  schema: Args;
  handler: ToolCallback<Args>;
}

export const CreateTool =
  <Args extends ZodRawShapeCompat>(
    name: string,
    description: string,
    schema: Args,
    handler: ToolCallback<Args>,
  ): (() => ToolDefinition<ZodRawShapeCompat>) =>
  () => ({
    name: name,
    description: description,
    schema: schema,
    handler: handler,
  });
