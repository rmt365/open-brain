import { Bot, Context } from "grammy";
import { handleCapture } from "./handlers/capture.ts";
import { handleSearch } from "./handlers/search.ts";
import { handleRecent } from "./handlers/recent.ts";
import { handleSetup } from "./handlers/setup.ts";
import { handleAsk } from "./handlers/ask.ts";
import { handlePref } from "./handlers/pref.ts";
import { handleDocument } from "./handlers/document.ts";

/**
 * Check if a user is allowed to use the bot.
 * If TELEGRAM_ALLOWED_USERS is set, only those user IDs are permitted.
 */
function isAuthorized(ctx: Context): boolean {
  const allowedUsersEnv = Deno.env.get("TELEGRAM_ALLOWED_USERS");
  if (!allowedUsersEnv) return true;

  const allowedIds = allowedUsersEnv
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (allowedIds.length === 0) return true;

  const userId = ctx.from?.id;
  if (!userId) return false;

  return allowedIds.includes(String(userId));
}

export function setupBot(bot: Bot, openBrainUrl: string): void {
  // Set bot commands for the menu
  bot.api.setMyCommands([
    { command: "start", description: "Welcome message and command list" },
    { command: "search", description: "Semantic search your thoughts" },
    { command: "ask", description: "Ask your brain a question" },
    { command: "recent", description: "List your last 10 thoughts" },
    { command: "pref", description: "Set a taste preference from natural language" },
    { command: "setup", description: "Show setup instructions for AI tools" },
  ]);

  // Authorization middleware
  bot.use(async (ctx, next) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply(
        "Sorry, you are not authorized to use this bot. Contact the administrator to get access.",
      );
      return;
    }
    await next();
  });

  // /start command
  bot.command("start", async (ctx) => {
    const name = ctx.from?.first_name || "there";
    await ctx.reply(
      `Hello ${name}! I'm your Open Brain capture bot.\n\n` +
        `Just send me any text and I'll capture it as a thought.\n\n` +
        `Commands:\n` +
        `/search <query> - Search your thoughts\n` +
        `/ask <question> - Ask your brain a question\n` +
        `/pref <description> - Set a taste preference\n` +
        `/recent - Show your last 10 thoughts\n\n` +
        `Try it out -- send me something you're thinking about.`,
    );
  });

  // /search command
  bot.command("search", (ctx) => handleSearch(ctx, openBrainUrl));

  // /ask command
  bot.command("ask", (ctx) => handleAsk(ctx, openBrainUrl));

  // /pref command
  bot.command("pref", (ctx) => handlePref(ctx, openBrainUrl));

  // /recent command
  bot.command("recent", (ctx) => handleRecent(ctx, openBrainUrl));

  // /setup command
  bot.command("setup", (ctx) => handleSetup(ctx));

  // Photo and document handlers (before default text handler)
  bot.on("message:photo", (ctx) => handleDocument(ctx, openBrainUrl));
  bot.on("message:document", (ctx) => handleDocument(ctx, openBrainUrl));

  // Default text handler -- capture as thought
  bot.on("message:text", (ctx) => handleCapture(ctx, openBrainUrl));
}
