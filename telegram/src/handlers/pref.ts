import { Context } from "grammy";
import { extractPreference } from "../client.ts";

export async function handlePref(ctx: Context, openBrainUrl: string): Promise<void> {
  const fullText = ctx.message?.text || "";
  const text = fullText.replace(/^\/pref\s*/, "").trim();

  if (!text) {
    await ctx.reply("Usage: `/pref <description>`\n\nExample: `/pref I like minimalist design, not cluttered`", {
      parse_mode: "Markdown",
    });
    return;
  }

  try {
    const response = await extractPreference(openBrainUrl, text);

    if (!response.success || !response.data) {
      await ctx.reply(response.error || "Could not extract preference. Try being more specific about what you want and don't want.");
      return;
    }

    const p = response.data;
    await ctx.reply(
      `*Preference saved:* ${p.preference_name}\n` +
      `*Domain:* ${p.domain}\n` +
      `*Want:* ${p.want}\n` +
      `*Reject:* ${p.reject}\n` +
      `*Type:* ${p.constraint_type}`,
      { parse_mode: "Markdown" },
    );
  } catch (error) {
    console.error("Pref extraction failed:", error);
    await ctx.reply("Failed to extract preference. Please try again.");
  }
}
