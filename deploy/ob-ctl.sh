#!/bin/bash
set -e

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTANCES_DIR="$DEPLOY_DIR/instances"

usage() {
  cat <<EOF
ob-ctl — Open Brain instance management

Usage:
  ob-ctl create <name> <subdomain>  Create a new instance (e.g., create tina-brain tina)
  ob-ctl magic-link <instance>      Print the magic onboarding link for an instance
  ob-ctl ollama-up                  Start shared Ollama
  ob-ctl ollama-down                Stop shared Ollama
  ob-ctl up <instance>              Start an instance (e.g., robin-brain)
  ob-ctl down <instance>            Stop an instance
  ob-ctl up-all                     Start all instances
  ob-ctl down-all                   Stop all instances
  ob-ctl logs <instance>            Tail instance logs
  ob-ctl status                     Show all running OB containers

Instance .env files go in: $INSTANCES_DIR/<instance>.env
EOF
  exit 1
}

require_env() {
  local instance="$1"
  local env_file="$INSTANCES_DIR/$instance.env"
  if [ ! -f "$env_file" ]; then
    echo "Error: $env_file not found"
    echo "Create it from template: cp $INSTANCES_DIR/.env.template $env_file"
    exit 1
  fi
  echo "$env_file"
}

ollama_up() {
  echo "[ob-ctl] Starting shared Ollama..."
  docker compose -f "$DEPLOY_DIR/docker-compose.ollama.yml" up -d
  echo "[ob-ctl] Ollama started"
}

ollama_down() {
  echo "[ob-ctl] Stopping shared Ollama..."
  docker compose -f "$DEPLOY_DIR/docker-compose.ollama.yml" down
}

instance_up() {
  local instance="$1"
  local env_file
  env_file=$(require_env "$instance")

  # Ensure data directory exists
  local data_dir="/root/open-brain/data/$instance"
  mkdir -p "$data_dir"

  echo "[ob-ctl] Starting $instance..."
  docker compose -f "$DEPLOY_DIR/docker-compose.instance.yml" \
    --env-file "$env_file" \
    -p "$instance" \
    up -d
  echo "[ob-ctl] $instance started"
}

instance_down() {
  local instance="$1"
  local env_file
  env_file=$(require_env "$instance")

  echo "[ob-ctl] Stopping $instance..."
  docker compose -f "$DEPLOY_DIR/docker-compose.instance.yml" \
    --env-file "$env_file" \
    -p "$instance" \
    down
}

up_all() {
  echo "[ob-ctl] Starting all instances..."
  for env_file in "$INSTANCES_DIR"/*.env; do
    [ -f "$env_file" ] || continue
    local name
    name=$(basename "$env_file" .env)
    [ "$name" = ".env" ] && continue
    instance_up "$name"
  done
}

down_all() {
  echo "[ob-ctl] Stopping all instances..."
  for env_file in "$INSTANCES_DIR"/*.env; do
    [ -f "$env_file" ] || continue
    local name
    name=$(basename "$env_file" .env)
    [ "$name" = ".env" ] && continue
    instance_down "$name"
  done
}

instance_logs() {
  local instance="$1"
  local env_file
  env_file=$(require_env "$instance")

  docker compose -f "$DEPLOY_DIR/docker-compose.instance.yml" \
    --env-file "$env_file" \
    -p "$instance" \
    logs -f
}

show_status() {
  echo "[ob-ctl] Open Brain containers:"
  echo ""
  docker ps --filter "name=ob-ollama" --filter "name=-brain" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
}

generate_key() {
  # Generate a URL-safe random key (43 chars, ~256 bits)
  openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
}

generate_token() {
  # Generate a shorter URL-safe token (32 chars)
  openssl rand -base64 24 | tr '+/' '-_' | tr -d '='
}

instance_create() {
  local instance="$1"
  local subdomain="$2"
  local env_file="$INSTANCES_DIR/$instance.env"
  local shared_env="$INSTANCES_DIR/.env.shared"

  if [ -z "$instance" ] || [ -z "$subdomain" ]; then
    echo "Usage: ob-ctl create <name> <subdomain>"
    echo "Example: ob-ctl create tina-brain tina"
    exit 1
  fi

  if [ -f "$env_file" ]; then
    echo "Error: $env_file already exists"
    exit 1
  fi

  # Load shared secrets if available
  local anthropic_key=""
  local wasabi_endpoint="https://s3.ca-central-1.wasabisys.com"
  local wasabi_region="ca-central-1"
  local wasabi_bucket=""
  local wasabi_access_key=""
  local wasabi_secret_key=""
  local domain_base="brain.ceruleancore.ca"

  if [ -f "$shared_env" ]; then
    # shellcheck source=/dev/null
    source "$shared_env"
    anthropic_key="${ANTHROPIC_API_KEY:-}"
    wasabi_endpoint="${WASABI_ENDPOINT:-$wasabi_endpoint}"
    wasabi_region="${WASABI_REGION:-$wasabi_region}"
    wasabi_bucket="${WASABI_BUCKET:-}"
    wasabi_access_key="${WASABI_ACCESS_KEY_ID:-}"
    wasabi_secret_key="${WASABI_SECRET_ACCESS_KEY:-}"
    domain_base="${DOMAIN_BASE:-$domain_base}"
  fi

  # Generate secrets
  local api_key
  api_key=$(generate_key)
  local mcp_token
  mcp_token=$(generate_token)

  cat > "$env_file" <<ENVEOF
# Open Brain — $instance
INSTANCE_NAME=$instance
SUBDOMAIN=$subdomain
DOMAIN_BASE=$domain_base

# API keys
ANTHROPIC_API_KEY=$anthropic_key
OPEN_BRAIN_API_KEY=$api_key
LLM_PROVIDER=anthropic
AI_MODEL=claude-haiku-4-5-20251001

# Backup (Wasabi S3)
ENABLE_LITESTREAM=true
WASABI_ENDPOINT=$wasabi_endpoint
WASABI_REGION=$wasabi_region
WASABI_BUCKET=$wasabi_bucket
WASABI_ACCESS_KEY_ID=$wasabi_access_key
WASABI_SECRET_ACCESS_KEY=$wasabi_secret_key

# MCP auth
MCP_URL_TOKEN=$mcp_token
# MCP_AUTH_USERS= (generate with: htpasswd -nbB brain <OPEN_BRAIN_API_KEY>)

# Telegram (optional — uncomment and fill in to enable)
# TELEGRAM_BOT_TOKEN=
# TELEGRAM_ALLOWED_USERS=
ENVEOF

  echo "[ob-ctl] Created $env_file"
  echo ""
  echo "  Instance:   $instance"
  echo "  Subdomain:  $subdomain.$domain_base"
  echo "  API Key:    $api_key"
  echo ""
  echo "  Magic link: https://$subdomain.$domain_base/ui/brain?key=$api_key"
  echo ""
  echo "Next steps:"
  echo "  1. Review $env_file (fill in any missing secrets)"
  echo "  2. Generate MCP basic auth: htpasswd -nbB brain '$api_key'"
  echo "  3. Start: ob-ctl up $instance"
  echo "  4. Send the magic link to the user"
}

magic_link() {
  local instance="$1"
  local env_file
  env_file=$(require_env "$instance")

  local subdomain domain_base api_key
  subdomain=$(grep "^SUBDOMAIN=" "$env_file" | cut -d= -f2)
  domain_base=$(grep "^DOMAIN_BASE=" "$env_file" | cut -d= -f2)
  api_key=$(grep "^OPEN_BRAIN_API_KEY=" "$env_file" | cut -d= -f2)

  if [ -z "$subdomain" ] || [ -z "$domain_base" ] || [ -z "$api_key" ]; then
    echo "Error: Missing SUBDOMAIN, DOMAIN_BASE, or OPEN_BRAIN_API_KEY in $env_file"
    exit 1
  fi

  echo "https://$subdomain.$domain_base/ui/brain?key=$api_key"
}

# Main
case "${1:-}" in
  create)
    instance_create "${2:-}" "${3:-}"
    ;;
  magic-link)
    [ -z "${2:-}" ] && usage
    magic_link "$2"
    ;;
  ollama-up)   ollama_up ;;
  ollama-down) ollama_down ;;
  up)
    [ -z "${2:-}" ] && usage
    instance_up "$2"
    ;;
  down)
    [ -z "${2:-}" ] && usage
    instance_down "$2"
    ;;
  up-all)   up_all ;;
  down-all) down_all ;;
  logs)
    [ -z "${2:-}" ] && usage
    instance_logs "$2"
    ;;
  status) show_status ;;
  *) usage ;;
esac
