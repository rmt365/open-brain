import { Context } from "grammy";
import { queryBrain } from "../client.ts";

export async function handleAsk(ctx: Context, openBrainUrl: string): Promise<void> {
  const fullText = ctx.message?.text || "";
  const question = fullText.replace(/^\/ask\s*/, "").trim();

  if (!question) {
    await ctx.reply("Usage: `/ask <question>`\n\nExample: `/ask what car should I buy?`", {
      parse_mode: "Markdown",
    });
    return;
  }

  try {
    const response = await queryBrain(openBrainUrl, question);

    if (!response.success || !response.data) {
      await ctx.reply(response.error || "Query failed. Please try again.");
      return;
    }

    await ctx.reply(response.data.answer);
  } catch (error) {
    console.error("Ask failed:", error);
    await ctx.reply("Failed to query brain. Please try again.");
  }
}
