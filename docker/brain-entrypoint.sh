#!/bin/sh
set -e

DENO_CMD="deno run --config=deno.json --allow-net --allow-read --allow-write --allow-env --allow-ffi src/main.ts"

if [ "$ENABLE_LITESTREAM" = "true" ] && [ -n "$WASABI_BUCKET" ] && [ -n "$WASABI_ACCESS_KEY_ID" ]; then
  echo "[entrypoint] Generating Litestream config..."
  cat > /etc/litestream.yml <<EOF
dbs:
  - path: /app/database/open-brain.db
    replicas:
      - type: s3
        endpoint: ${WASABI_ENDPOINT:-https://s3.wasabisys.com}
        region: ${WASABI_REGION:-us-east-1}
        bucket: ${WASABI_BUCKET}
        path: ${SERVICE_NAME:-open-brain}/open-brain.db
        access-key-id: ${WASABI_ACCESS_KEY_ID}
        secret-access-key: ${WASABI_SECRET_ACCESS_KEY}
EOF
  echo "[entrypoint] Starting with Litestream replication..."
  exec litestream replicate -exec "$DENO_CMD"
else
  echo "[entrypoint] Starting without Litestream (ENABLE_LITESTREAM=$ENABLE_LITESTREAM)"
  exec $DENO_CMD
fi
