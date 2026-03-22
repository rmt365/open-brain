#!/bin/bash
set -e

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTANCES_DIR="$DEPLOY_DIR/instances"

usage() {
  cat <<EOF
ob-ctl — Open Brain instance management

Usage:
  ob-ctl ollama-up              Start shared Ollama
  ob-ctl ollama-down            Stop shared Ollama
  ob-ctl up <instance>          Start an instance (e.g., robin-brain)
  ob-ctl down <instance>        Stop an instance
  ob-ctl up-all                 Start all instances
  ob-ctl down-all               Stop all instances
  ob-ctl logs <instance>        Tail instance logs
  ob-ctl status                 Show all running OB containers

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

# Main
case "${1:-}" in
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
