import { Context } from "grammy";
import { captureThought } from "../client.ts";

function extractDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

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
      const sourceUrl = thought.source_url;
      const isUrlIngested = sourceUrl && thought.thought_type === "reference" && thought.metadata?.title;
      const isUrlMentioned = sourceUrl && !isUrlIngested;

      if (isUrlIngested) {
        const domain = extractDomain(sourceUrl);
        await ctx.reply(
          `Fetched: *${thought.metadata.title}* from ${domain} — saved as reference, indexed for search`,
          { parse_mode: "Markdown" },
        );
      } else if (isUrlMentioned) {
        const parts: string[] = [];
        if (thought.auto_type) parts.push(`tagged as *${thought.auto_type}*`);
        if (thought.auto_topics?.length) parts.push(`about ${thought.auto_topics.join(", ")}`);
        const base = parts.length > 0 ? `Got it — ${parts.join(" ")}` : "Got it — captured";
        await ctx.reply(`${base}. Also fetching ${sourceUrl} in the background.`, { parse_mode: "Markdown" });
      } else {
        const parts: string[] = [];
        if (thought.auto_type) parts.push(`tagged as *${thought.auto_type}*`);
        if (thought.auto_topics?.length) parts.push(`about ${thought.auto_topics.join(", ")}`);
        if (parts.length > 0) {
          await ctx.reply(`Got it — ${parts.join(" ")}.`, { parse_mode: "Markdown" });
        } else {
          await ctx.reply("Got it — captured.");
        }
      }
    } else {
      await ctx.reply("Got it — captured.");
    }
  } catch (error) {
    console.error("Failed to capture thought:", error);
    await ctx.reply("Failed to capture thought. Please try again.");
  }
}
