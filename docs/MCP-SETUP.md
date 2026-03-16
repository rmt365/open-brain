# Open Brain MCP Setup Guide

Connect your Open Brain instance to AI tools so they can capture thoughts, search your brain, and use your preferences as context.

## What You Need

- Your Open Brain URL (e.g., `https://robin.brain.ceruleancore.ca`)
- Your API key (the `OPEN_BRAIN_API_KEY` from your instance)
- Your base64 auth string (see below)

### Generate Your Auth String

The MCP endpoint uses basic auth with username `brain` and your API key as password.

```bash
echo -n 'brain:YOUR_API_KEY_HERE' | base64
```

Example:
```bash
echo -n 'brain:iAMVpL3OaQ4URViV2LTAwqiwWCRhBE5QAbudZNkFkaM' | base64
# Output: YnJhaW46aUFNVnBMM09hUTRVUlZpVjJMVEF3cWl3V0NSaEJFNVFBYnVkWk5rRmthTQ==
```

Save this string — you'll use it in the configurations below.

---

## Claude Code (CLI)

```bash
claude mcp add ob-robin https://robin.brain.ceruleancore.ca/mcp \
  --transport http \
  --scope user \
  --header "Authorization: Basic YOUR_BASE64_AUTH_STRING"
```

- `--scope user` makes it available in all projects
- `--scope project` limits it to the current project
- Restart Claude Code or start a new session to pick it up

**Remove:**
```bash
claude mcp remove ob-robin
```

---

## Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "ob-robin": {
      "transport": "http",
      "url": "https://robin.brain.ceruleancore.ca/mcp",
      "headers": {
        "Authorization": "Basic YOUR_BASE64_AUTH_STRING"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

---

## Cursor

Open Settings → MCP Servers → Add Server:

- **Name**: `ob-robin`
- **Type**: `HTTP`
- **URL**: `https://robin.brain.ceruleancore.ca/mcp`
- **Headers**: `Authorization: Basic YOUR_BASE64_AUTH_STRING`

Or edit `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "ob-robin": {
      "transport": "http",
      "url": "https://robin.brain.ceruleancore.ca/mcp",
      "headers": {
        "Authorization": "Basic YOUR_BASE64_AUTH_STRING"
      }
    }
  }
}
```

---

## Windsurf

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "ob-robin": {
      "transportType": "http",
      "url": "https://robin.brain.ceruleancore.ca/mcp",
      "headers": {
        "Authorization": "Basic YOUR_BASE64_AUTH_STRING"
      }
    }
  }
}
```

Restart Windsurf after saving.

---

## VS Code (GitHub Copilot)

Add to your VS Code settings (`.vscode/settings.json` or global settings):

```json
{
  "github.copilot.chat.mcp.servers": {
    "ob-robin": {
      "type": "http",
      "url": "https://robin.brain.ceruleancore.ca/mcp",
      "headers": {
        "Authorization": "Basic YOUR_BASE64_AUTH_STRING"
      }
    }
  }
}
```

---

## Gemini CLI

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "ob-robin": {
      "httpUrl": "https://robin.brain.ceruleancore.ca/mcp",
      "headers": {
        "Authorization": "Basic YOUR_BASE64_AUTH_STRING"
      }
    }
  }
}
```

---

## Any MCP Client (Generic HTTP)

The MCP server uses **Streamable HTTP** transport:

- **URL**: `https://YOUR_SUBDOMAIN.brain.ceruleancore.ca/mcp`
- **Auth**: HTTP Basic Auth — username `brain`, password is your API key
- **Header**: `Authorization: Basic YOUR_BASE64_AUTH_STRING`
- **Sessions**: Stateful (5-minute timeout)
- **Health check**: `GET /mcp` returns session info when authenticated

---

## What You Get

### Automatic Context (Resources)

Your preferences are automatically loaded into the AI's context when it connects — no tool call needed. These are the guardrails and decisions you've recorded.

### Available Tools

| Tool | Description |
|------|-------------|
| `capture_thought` | Save a thought to your brain |
| `search_brain` | Semantic search across all thoughts |
| `browse_recent` | See recent thoughts |
| `find_related` | Find thoughts related to a topic |
| `brain_stats` | Overview of your brain's contents |
| `list_topics` | See what topics you think about |
| `get_taste_profile` | Get your preferences as a text block |
| `add_preference` | Record a new preference/decision |
| `list_preferences` | Browse recorded preferences |
| `remove_preference` | Delete a preference |
| `ingest_url` | Save and index a web page |
| `surface_forgotten` | Resurface old thoughts you may have forgotten |

---

## Troubleshooting

**401 Unauthorized**: Check your base64 auth string. Regenerate it with the `echo -n | base64` command above.

**Connection timeout**: The MCP server may be starting up. Wait 30 seconds and try again.

**Tools not appearing**: Restart your AI tool after adding the MCP config. Some tools require a fresh session.

**Preferences not loading**: Preferences show as a resource. Some MCP clients don't auto-load resources — use the `get_taste_profile` tool instead.
