import { Context } from "grammy";

function btoa(str: string): string {
  return globalThis.btoa(str);
}

export async function handleSetup(ctx: Context): Promise<void> {
  const publicUrl = Deno.env.get("PUBLIC_URL");
  const apiKey = Deno.env.get("OPEN_BRAIN_API_KEY");

  if (!publicUrl || !apiKey) {
    await ctx.reply(
      "Setup instructions are not available. PUBLIC_URL or API key not configured.",
    );
    return;
  }

  const authString = btoa(`brain:${apiKey}`);
  const mcpUrl = `${publicUrl}/mcp`;
  const mcpUrlToken = Deno.env.get("MCP_URL_TOKEN");
  const connectUrl = mcpUrlToken ? `${publicUrl}/connect/${mcpUrlToken}` : null;
  const browseUrl = `${publicUrl}/ui/browse`;
  const chatUrl = `${publicUrl}/ui/brain`;
  const setupUrl = `${publicUrl}/ui/setup`;

  const msg =
    `🧠 *Open Brain Setup*\n\n` +
    `*Web UI*\n` +
    `Chat: ${chatUrl}\n` +
    `Browse: ${browseUrl}\n` +
    `API Key: \`${apiKey}\`\n\n` +
    `───────────────\n\n` +
    `*Claude Code (CLI)*\n` +
    `\`\`\`\n` +
    `claude mcp add ob https://robin.brain.ceruleancore.ca/mcp --transport http --scope user --header "Authorization: Basic ${authString}"\n` +
    `\`\`\`\n\n` +
    `*Claude Desktop / Cursor / Windsurf*\n` +
    `Add to your MCP config:\n` +
    `\`\`\`json\n` +
    `{\n` +
    `  "ob": {\n` +
    `    "transport": "http",\n` +
    `    "url": "${mcpUrl}",\n` +
    `    "headers": {\n` +
    `      "Authorization": "Basic ${authString}"\n` +
    `    }\n` +
    `  }\n` +
    `}\n` +
    `\`\`\`\n\n` +
    (connectUrl
      ? `*Claude.ai (Web)*\n` +
        `${connectUrl}\n\n`
      : '') +
    `*ChatGPT Custom GPT*\n` +
    `Use Actions with the OpenAPI spec and Bearer auth.\n` +
    `API Key: \`${apiKey}\`\n\n` +
    `Full setup guide: ${setupUrl}`;

  await ctx.reply(msg, { parse_mode: "Markdown" });
}
