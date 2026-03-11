import { Bot } from "grammy";
import { setupBot } from "./bot.ts";

const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN environment variable is required");
  Deno.exit(1);
}

const openBrainUrl = Deno.env.get("OPEN_BRAIN_URL") || "http://open-brain:3012";

console.log(`Starting Open Brain Telegram bot...`);
console.log(`Open Brain URL: ${openBrainUrl}`);

const bot = new Bot(token);

setupBot(bot, openBrainUrl);

// Graceful shutdown
const shutdown = () => {
  console.log("Shutting down bot...");
  bot.stop();
};

Deno.addSignalListener("SIGINT", shutdown);
Deno.addSignalListener("SIGTERM", shutdown);

// Start long-polling
bot.start({
  onStart: (botInfo) => {
    console.log(`Bot @${botInfo.username} is running`);
  },
});
