import { Bot, Context } from "grammy";
import { handleCapture } from "./handlers/capture.ts";
import { handleSearch } from "./handlers/search.ts";
import { handleRecent } from "./handlers/recent.ts";
import { handleSetup } from "./handlers/setup.ts";
import { handleAsk } from "./handlers/ask.ts";
import { handlePref } from "./handlers/pref.ts";
import { handleDocument } from "./handlers/document.ts";
import { handleAudio } from "./handlers/audio.ts";
import { SessionStore } from "./session.ts";

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
  const sessions = new SessionStore();

  // Set bot commands for the menu
  bot.api.setMyCommands([
    { command: "start", description: "Welcome message and command list" },
    { command: "search", description: "Semantic search your thoughts" },
    { command: "ask", description: "Ask your brain a question" },
    { command: "done", description: "Exit Q&A session, return to capture mode" },
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

  // /ask command — start or continue a Q&A session
  bot.command("ask", (ctx) => {
    const question = (ctx.message?.text || "").replace(/^\/ask\s*/, "").trim();
    return handleAsk(ctx, openBrainUrl, sessions, question);
  });

  // /done command — exit Q&A session
  bot.command("done", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId && sessions.isActive(chatId)) {
      sessions.clear(chatId);
      await ctx.reply("Session ended. Send me anything to capture it as a thought.");
    } else {
      await ctx.reply("No active session. Send me anything to capture it as a thought.");
    }
  });

  // /pref command
  bot.command("pref", (ctx) => handlePref(ctx, openBrainUrl));

  // /recent command
  bot.command("recent", (ctx) => handleRecent(ctx, openBrainUrl));

  // /setup command
  bot.command("setup", (ctx) => handleSetup(ctx));

  // Photo and document handlers (before default text handler)
  bot.on("message:photo", (ctx) => handleDocument(ctx, openBrainUrl));
  bot.on("message:document", (ctx) => handleDocument(ctx, openBrainUrl));

  // Voice and audio handlers
  bot.on("message:voice", (ctx) => handleAudio(ctx, openBrainUrl));
  bot.on("message:audio", (ctx) => handleAudio(ctx, openBrainUrl));

  // Default text handler — if in active Q&A session, treat as follow-up; otherwise capture
  bot.on("message:text", (ctx) => {
    const chatId = ctx.chat?.id;
    sessions.pruneExpired();
    if (chatId && sessions.isActive(chatId)) {
      const question = ctx.message?.text || "";
      return handleAsk(ctx, openBrainUrl, sessions, question);
    }
    return handleCapture(ctx, openBrainUrl);
  });
}
