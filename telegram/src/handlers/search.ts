import { Context } from "grammy";
import { searchThoughts } from "../client.ts";

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

export async function handleSearch(ctx: Context, openBrainUrl: string): Promise<void> {
  const fullText = ctx.message?.text || "";
  const query = fullText.replace(/^\/search\s*/, "").trim();

  if (!query) {
    await ctx.reply("Usage: `/search <query>`\n\nExample: `/search productivity habits`", {
      parse_mode: "Markdown",
    });
    return;
  }

  try {
    const response = await searchThoughts(openBrainUrl, query, 5);

    if (!response.success || !response.data || response.data.length === 0) {
      await ctx.reply("No matching thoughts found.");
      return;
    }

    const lines: string[] = [`Results for "${query}":\n`];

    for (let i = 0; i < response.data.length; i++) {
      const result = response.data[i];
      const thought = result.thought;
      const typeTag = thought.auto_type ? `[${thought.auto_type}]` : "[thought]";
      const similarity = Math.round(result.similarity * 100);
      const text = truncate(thought.text, 80);
      lines.push(`${i + 1}. ${typeTag} ${text} (${similarity}%)`);
    }

    await ctx.reply(lines.join("\n"));
  } catch (error) {
    console.error("Search failed:", error);
    await ctx.reply("Search failed. Please try again.");
  }
}
