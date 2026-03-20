/**
 * Compound Tool Helper
 * Creates tools with an `action` enum parameter that dispatches to different handlers.
 */

import { z } from "zod";
import { CreateTool } from "./create-tool.js";

type TextResult = {
  content: [{ type: "text"; text: string }];
  isError?: boolean;
};

function textResult(text: string, isError?: boolean): TextResult {
  return {
    content: [{ type: "text" as const, text }],
    ...(isError ? { isError: true } : {}),
  };
}

interface ActionDef {
  description: string;
  /** Required parameter names for this action (validated at runtime) */
  required?: string[];
  handler: (args: Record<string, unknown>) => Promise<TextResult>;
}

/**
 * Create a compound tool with action-based dispatch.
 *
 * @param name - Tool name
 * @param preamble - Opening line of the tool description
 * @param actions - Map of action name → { description, required?, handler }
 * @param params - Additional Zod schema fields beyond `action` (all should be optional)
 */
export function CreateCompoundTool(
  name: string,
  preamble: string,
  actions: Record<string, ActionDef>,
  params: Record<string, z.ZodTypeAny>,
) {
  const actionNames = Object.keys(actions) as [string, ...string[]];

  // Build description listing each action
  const actionDocs = actionNames
    .map((a) => `  - ${a}: ${actions[a].description}`)
    .join("\n");
  const description = `${preamble}\n\nActions:\n${actionDocs}`;

  const schema = {
    action: z.enum(actionNames).describe("The action to perform"),
    ...params,
  };

  return CreateTool(name, description, schema, async (args) => {
    const { action, ...rest } = args as { action: string } & Record<string, unknown>;
    const actionDef = actions[action];

    if (!actionDef) {
      return textResult(`Unknown action "${action}". Valid actions: ${actionNames.join(", ")}`, true);
    }

    // Validate required params for this action
    if (actionDef.required) {
      const missing = actionDef.required.filter(
        (p) => rest[p] === undefined || rest[p] === null || rest[p] === "",
      );
      if (missing.length > 0) {
        return textResult(
          `Action "${action}" requires: ${missing.join(", ")}`,
          true,
        );
      }
    }

    try {
      return await actionDef.handler(rest);
    } catch (error) {
      return textResult(
        `Error in ${name}/${action}: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }
  });
}

export { textResult };
