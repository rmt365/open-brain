#!/bin/bash
# claude-bootstrap.sh — One-time Claude Code setup for new machines
#
# Sets up:
#   - Open Brain MCP server (user scope, all projects)
#   - SessionStart hook to inject constraints from Open Brain
#   - Global CLAUDE.md with cross-project standards
#
# Prerequisites:
#   - Claude Code CLI installed
#   - OPEN_BRAIN_API_KEY environment variable set
#
# Usage:
#   export OPEN_BRAIN_API_KEY="your-key-here"
#   bash deploy/claude-bootstrap.sh

set -e

OPEN_BRAIN_URL="${OPEN_BRAIN_URL:-https://robin.brain.ceruleancore.ca}"
CLAUDE_DIR="$HOME/.claude"
HOOKS_DIR="$CLAUDE_DIR/hooks"

# ─── Preflight ─────────────────────────────────────────────
if ! command -v claude &>/dev/null; then
  echo "Error: Claude Code CLI not found. Install it first."
  exit 1
fi

if [ -z "$OPEN_BRAIN_API_KEY" ]; then
  echo "Error: OPEN_BRAIN_API_KEY not set."
  echo "  export OPEN_BRAIN_API_KEY=\"your-key\""
  exit 1
fi

echo "[bootstrap] Setting up Claude Code with Open Brain..."

# ─── 1. Register Open Brain MCP at user scope ─────────────
echo "[bootstrap] Adding Open Brain MCP server (user scope)..."
claude mcp add --scope user open-brain --transport http \
  "$OPEN_BRAIN_URL/mcp" \
  --header "Authorization: Bearer $OPEN_BRAIN_API_KEY"

# ─── 2. Create SessionStart hook ──────────────────────────
echo "[bootstrap] Creating SessionStart hook..."
mkdir -p "$HOOKS_DIR"

cat > "$HOOKS_DIR/session-start-constraints.sh" << 'HOOKEOF'
#!/bin/bash
# Pull Claude Code constraints from Open Brain at session start
OPEN_BRAIN_URL="${OPEN_BRAIN_URL:-https://robin.brain.ceruleancore.ca}"
OPEN_BRAIN_API_KEY="${OPEN_BRAIN_API_KEY:-}"

if [ -z "$OPEN_BRAIN_API_KEY" ]; then
  exit 0
fi

AUTH_HEADER="Authorization: Bearer $OPEN_BRAIN_API_KEY"

# ── 1. Always inject claude-code domain constraints ──
RESPONSE=$(curl -sf -H "$AUTH_HEADER" \
  "$OPEN_BRAIN_URL/preferences/block?domain=claude-code" 2>/dev/null)

if [ $? -eq 0 ] && [ -n "$RESPONSE" ]; then
  BLOCK=$(echo "$RESPONSE" | jq -r '.data.block // empty' 2>/dev/null)
  if [ -n "$BLOCK" ]; then
    echo "# Constraints from Open Brain"
    echo ""
    echo "$BLOCK"
  fi
fi

# ── 2. Detect project type and suggest relevant domains ──
DETECTED_DOMAINS=""

[ -f "deno.json" ] || [ -f "deno.jsonc" ] && DETECTED_DOMAINS="$DETECTED_DOMAINS deno"
[ -f "package.json" ] && DETECTED_DOMAINS="$DETECTED_DOMAINS node javascript"
[ -f "Cargo.toml" ] && DETECTED_DOMAINS="$DETECTED_DOMAINS rust"
[ -f "go.mod" ] && DETECTED_DOMAINS="$DETECTED_DOMAINS go"
[ -f "pyproject.toml" ] || [ -f "setup.py" ] && DETECTED_DOMAINS="$DETECTED_DOMAINS python"
[ -f "tsconfig.json" ] && DETECTED_DOMAINS="$DETECTED_DOMAINS typescript"
[ -f "docker-compose.yml" ] || [ -f "docker-compose.yaml" ] && DETECTED_DOMAINS="$DETECTED_DOMAINS docker"

if [ -z "$DETECTED_DOMAINS" ]; then
  exit 0
fi

# Fetch available domains from Open Brain
DOMAINS_RESPONSE=$(curl -sf -H "$AUTH_HEADER" \
  "$OPEN_BRAIN_URL/preferences/domains" 2>/dev/null)

if [ $? -ne 0 ] || [ -z "$DOMAINS_RESPONSE" ]; then
  exit 0
fi

AVAILABLE=$(echo "$DOMAINS_RESPONSE" | jq -r '.data[]?.domain // empty' 2>/dev/null)

# Find matches (excluding claude-code, already injected)
MATCHES=""
for detected in $DETECTED_DOMAINS; do
  for available in $AVAILABLE; do
    if [ "$detected" = "$available" ] && [ "$available" != "claude-code" ]; then
      MATCHES="$MATCHES $available"
    fi
  done
done

if [ -n "$MATCHES" ]; then
  echo ""
  echo "# Suggested constraint domains"
  echo "Open Brain has constraints for domains matching this project:"
  for m in $MATCHES; do
    echo "  - $m"
  done
  echo ""
  echo "Use the capture tool (action: block) to store new constraints, or ask me to fetch constraints for these domains."
fi
HOOKEOF

chmod +x "$HOOKS_DIR/session-start-constraints.sh"

# ─── 3. Update settings.json ──────────────────────────────
echo "[bootstrap] Configuring settings.json..."

SETTINGS_FILE="$CLAUDE_DIR/settings.json"

if [ -f "$SETTINGS_FILE" ]; then
  # Merge SessionStart hook into existing settings
  python3 -c "
import json, sys

with open('$SETTINGS_FILE') as f:
    settings = json.load(f)

hooks = settings.setdefault('hooks', {})
session_start = hooks.get('SessionStart', [])

# Check if already configured
already_set = any(
    any(h.get('command', '').endswith('session-start-constraints.sh') for h in entry.get('hooks', []))
    for entry in session_start
)

if not already_set:
    session_start.append({
        'matcher': '',
        'hooks': [{
            'type': 'command',
            'command': '~/.claude/hooks/session-start-constraints.sh'
        }]
    })
    hooks['SessionStart'] = session_start

with open('$SETTINGS_FILE', 'w') as f:
    json.dump(settings, f, indent=4)
    f.write('\n')

print('  SessionStart hook ' + ('already configured' if already_set else 'added'))
"
else
  cat > "$SETTINGS_FILE" << 'SETTINGSEOF'
{
    "$schema": "https://json.schemastore.org/claude-code-settings.json",
    "hooks": {
        "SessionStart": [
            {
                "matcher": "",
                "hooks": [
                    {
                        "type": "command",
                        "command": "~/.claude/hooks/session-start-constraints.sh"
                    }
                ]
            }
        ]
    }
}
SETTINGSEOF
  echo "  Created settings.json with SessionStart hook"
fi

# ─── 4. Create global CLAUDE.md (if not exists) ───────────
echo "[bootstrap] Setting up global CLAUDE.md..."

GLOBAL_CLAUDE_MD="$CLAUDE_DIR/CLAUDE.md"

if [ ! -f "$GLOBAL_CLAUDE_MD" ]; then
  cat > "$GLOBAL_CLAUDE_MD" << 'CLAUDEEOF'
# Global Constraints

## Code Style
- Prefer simplicity over abstraction
- Don't over-engineer — solve the current problem
- Run verify/lint/test before committing

## Architecture
- Deno for services, Node.js only for MCP sidecars
- Lit web components for UI — never React
- SQLite for data storage

## Open Brain Integration
- This machine is connected to Open Brain MCP (user scope)
- Use `capture` tool to store reusable constraints with `domain: "claude-code"`
- Constraints stored in Open Brain are injected at session start via hook
CLAUDEEOF
  echo "  Created global CLAUDE.md"
else
  echo "  Global CLAUDE.md already exists, skipping"
fi

# ─── Done ──────────────────────────────────────────────────
echo ""
echo "[bootstrap] Done! Claude Code is configured with:"
echo "  - Open Brain MCP server (user scope, all projects)"
echo "  - SessionStart hook (injects constraints from Open Brain)"
echo "  - Global CLAUDE.md (~/.claude/CLAUDE.md)"
echo ""
echo "Make sure OPEN_BRAIN_API_KEY is in your shell profile:"
echo "  echo 'export OPEN_BRAIN_API_KEY=\"$OPEN_BRAIN_API_KEY\"' >> ~/.bashrc"
