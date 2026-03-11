import { z } from "zod";
import { CreateTool } from "../helpers/create-tool.js";
import { captureThought } from "../helpers/open-brain-client.js";

const CaptureThoughtTool = CreateTool(
  "capture_thought",
  "Capture a new thought, note, idea, question, or observation. The system will " +
  "auto-classify the thought type and extract topics. Use this whenever the user " +
  "wants to remember, record, or save something.",
  {
    text: z.string().describe("The thought content to capture"),
  },
  async ({ text }) => {
    try {
      const response = await captureThought(text);

      if (!response.success || !response.data) {
        return {
          content: [{
            type: "text" as const,
            text: `Failed to capture thought: ${response.error || "Unknown error"}`,
          }],
          isError: true,
        };
      }

      const t = response.data;
      const date = new Date(t.created_at).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      });

      const parts = [
        `Thought captured successfully.`,
        ``,
        `Type: ${t.thought_type}`,
      ];

      if (t.auto_type && t.auto_type !== t.thought_type) {
        parts.push(`Auto-classified as: ${t.auto_type} (confidence: ${((t.confidence || 0) * 100).toFixed(0)}%)`);
      }

      if (t.topic) {
        parts.push(`Topic: ${t.topic}`);
      }

      if (t.auto_topics && t.auto_topics.length > 0) {
        parts.push(`Auto-topics: ${t.auto_topics.join(", ")}`);
      }

      parts.push(`Date: ${date}`);
      parts.push(`ID: ${t.id}`);

      return {
        content: [{
          type: "text" as const,
          text: parts.join("\n"),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error capturing thought: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  },
);

export default CaptureThoughtTool;
