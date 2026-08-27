#!/usr/bin/env bash
set -euo pipefail

TASK="${1:-}"
TUNNEL_PORT=55432
PROJECT_ID="150ab77d-498c-4db7-9aa9-4db3262064cb"
ENVIRONMENT_ID="518efc99-6dc5-4f15-9ef1-49ab57a87d2b"
POSTGRES_SERVICE_ID="0b9dd5da-27b1-4b42-a37b-717a78a55a24"
SSH_IDENTITY="${RAILWAY_SSH_IDENTITY:-$HOME/.ssh/subaanqasim}"
SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIRECTORY/../.." && pwd)"

if [[ "$TASK" != "seed" && "$TASK" != "embed" ]]; then
  echo "Usage: $0 <seed|embed>" >&2
  exit 1
fi

cd "$REPOSITORY_ROOT"

SSH_CONFIG="$(mktemp)"
railway ssh config \
  --project "$PROJECT_ID" \
  --environment "$ENVIRONMENT_ID" \
  --service "$POSTGRES_SERVICE_ID" \
  --identity-file "$SSH_IDENTITY" \
  --dry-run \
  >"$SSH_CONFIG"

ssh \
  -F "$SSH_CONFIG" \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=accept-new \
  -N \
  -L "127.0.0.1:$TUNNEL_PORT:127.0.0.1:5432" \
  railway-postgres \
  >/dev/null 2>&1 &
TUNNEL_PID=$!
trap 'kill "$TUNNEL_PID" 2>/dev/null || true; rm -f "$SSH_CONFIG"' EXIT

for _ in $(seq 1 50); do
  if nc -z 127.0.0.1 "$TUNNEL_PORT" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

if ! nc -z 127.0.0.1 "$TUNNEL_PORT" >/dev/null 2>&1; then
  echo "Railway database tunnel did not start" >&2
  exit 1
fi

railway run --service api -- node --input-type=module -e \
  "const url = new URL(process.env.POSTGRES_URL); url.hostname = '127.0.0.1'; url.port = '$TUNNEL_PORT'; process.env.POSTGRES_URL = url.toString(); await import('./api-service/dist/scripts/$TASK.js');"
