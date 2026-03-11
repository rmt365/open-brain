import { Context } from "grammy";
import { listThoughts } from "../client.ts";

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export async function handleRecent(ctx: Context, openBrainUrl: string): Promise<void> {
  try {
    const response = await listThoughts(openBrainUrl, 10);

    if (!response.success || !response.data || response.data.items.length === 0) {
      await ctx.reply("No thoughts captured yet. Send me a message to get started!");
      return;
    }

    const lines: string[] = ["Recent thoughts:\n"];

    for (let i = 0; i < response.data.items.length; i++) {
      const thought = response.data.items[i];
      const typeTag = thought.auto_type ? `[${thought.auto_type}]` : "[thought]";
      const text = truncate(thought.text, 80);
      const date = formatDate(thought.created_at);
      lines.push(`${i + 1}. ${typeTag} ${text}`);
      lines.push(`   ${date}`);
    }

    await ctx.reply(lines.join("\n"));
  } catch (error) {
    console.error("Failed to list recent thoughts:", error);
    await ctx.reply("Failed to load recent thoughts. Please try again.");
  }
}
