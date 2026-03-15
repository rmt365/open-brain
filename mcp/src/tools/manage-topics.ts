import { z } from "zod";
import { CreateTool } from "../helpers/create-tool.js";
import { approveSuggestion, rejectSuggestion } from "../helpers/open-brain-client.js";

const ManageTopicsTool = CreateTool(
  "manage_topic_suggestion",
  "Approve or reject a pending topic suggestion. Use list_topics first to see " +
  "pending suggestions with their IDs. When approving, optionally assign a life area.",
  {
    suggestion_id: z
      .number()
      .describe("The ID of the suggestion to approve or reject"),
    action: z
      .enum(["approve", "reject"])
      .describe("Whether to approve or reject the suggestion"),
    life_area: z
      .enum(["craft", "business", "systems", "health", "marriage", "relationships", "creative", "wild", "meta"])
      .optional()
      .describe("Life area to assign when approving (optional)"),
  },
  async ({ suggestion_id, action, life_area }) => {
    try {
      if (action === "approve") {
        const response = await approveSuggestion(suggestion_id, life_area);

        if (!response.success || !response.data) {
          return {
            content: [{
              type: "text" as const,
              text: `Failed to approve suggestion: ${response.error || "Unknown error"}`,
            }],
            isError: true,
          };
        }

        const topic = response.data;
        const areaStr = topic.life_area ? ` (area: ${topic.life_area})` : "";
        return {
          content: [{
            type: "text" as const,
            text: `Topic "${topic.name}" approved and added to managed topics${areaStr}.`,
          }],
        };
      } else {
        const response = await rejectSuggestion(suggestion_id);

        if (!response.success) {
          return {
            content: [{
              type: "text" as const,
              text: `Failed to reject suggestion: ${response.error || "Unknown error"}`,
            }],
            isError: true,
          };
        }

        return {
          content: [{
            type: "text" as const,
            text: "Suggestion rejected.",
          }],
        };
      }
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error managing suggestion: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  },
);

export default ManageTopicsTool;
