import { Context } from "grammy";
import { captureThought } from "../client.ts";

export async function handleCapture(ctx: Context, openBrainUrl: string): Promise<void> {
  const text = ctx.message?.text;
  if (!text) return;

  const metadata: Record<string, unknown> = {
    telegram_user_id: ctx.from?.id,
    telegram_username: ctx.from?.username,
    user: ctx.from?.first_name,
  };

  try {
    const response = await captureThought(openBrainUrl, text, metadata);

    if (response.success && response.data) {
      const thought = response.data;
      const autoType = thought.auto_type;
      const autoTopics = thought.auto_topics;

      if (autoType || (autoTopics && autoTopics.length > 0)) {
        const parts: string[] = [];
        if (autoType) parts.push(`tagged as *${autoType}*`);
        if (autoTopics && autoTopics.length > 0) parts.push(`about ${autoTopics.join(", ")}`);
        await ctx.reply(`Got it -- ${parts.join(" ")}.`, { parse_mode: "Markdown" });
      } else {
        await ctx.reply("Got it -- captured.");
      }
    } else {
      await ctx.reply("Got it -- captured.");
    }
  } catch (error) {
    console.error("Failed to capture thought:", error);
    await ctx.reply("Failed to capture thought. Please try again.");
  }
}
