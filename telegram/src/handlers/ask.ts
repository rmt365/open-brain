import { Context } from "grammy";
import { queryBrain } from "../client.ts";
import type { SessionStore } from "../session.ts";

export async function handleAsk(
  ctx: Context,
  openBrainUrl: string,
  sessions: SessionStore,
  question: string
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  if (!question) {
    await ctx.reply("Usage: `/ask <question>`\n\nExample: `/ask what car should I buy?`", {
      parse_mode: "Markdown",
    });
    return;
  }

  try {
    const history = sessions.getHistory(chatId);
    const response = await queryBrain(openBrainUrl, question, history.length > 0 ? history : undefined);

    if (!response.success || !response.data) {
      await ctx.reply(response.error || "Query failed. Please try again.");
      return;
    }

    const answer = response.data.answer;

    sessions.addTurn(chatId, "user", question);
    sessions.addTurn(chatId, "assistant", answer);

    const footer = "\n\n_↩ Reply to follow up · /done to exit_";
    await ctx.reply(answer + footer, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Ask failed:", error);
    await ctx.reply("Failed to query brain. Please try again.");
  }
}
