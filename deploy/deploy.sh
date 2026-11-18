#!/usr/bin/env bash
# Runs on the VM: replaces the running Kattan Bot container with the given image.
#   ai-app  published on 127.0.0.1:8085 of the VM only, and on the Docker network budget-internal,
#           where it reaches the budget tracker's MCP endpoint as http://budget-tracking:3000/mcp
# The cloudflared service on the VM forwards a public hostname to that port.
# Usage: deploy.sh <image>
set -euo pipefail

image="$1"
dir="$HOME/ai-app"
env_file="$dir/.env"
name=ai-app
host_port=8085
network=budget-internal

if [ ! -f "$env_file" ]; then
  echo "$env_file is missing; the workflow writes it from the AI_APP_ENV secret" >&2
  exit 1
fi

# Pull before stopping anything, so the app is down only for the swap.
docker pull "$image"

# The private network shared with the budget tracker (its deploy creates it too; made once).
docker network inspect "$network" >/dev/null 2>&1 || docker network create "$network" >/dev/null

docker rm -f "$name" >/dev/null 2>&1 || true
docker run -d --name "$name" \
  --init \
  --restart unless-stopped \
  --log-opt max-size=10m --log-opt max-file=3 \
  -p "127.0.0.1:$host_port:3000" \
  --network "$network" \
  --env-file "$env_file" \
  -e BUDGET_MCP_URL="${BUDGET_MCP_URL:-http://budget-tracking:3000/mcp}" \
  "$image"

sleep 15
if [ "$(docker inspect -f '{{.State.Running}} {{.RestartCount}}' "$name")" != "true 0" ]; then
  echo "$name did not stay up:" >&2
  docker logs --tail 50 "$name" >&2
  exit 1
fi
docker logs --tail 10 "$name"

systemctl is-active --quiet cloudflared 2>/dev/null \
  || echo "warning: the cloudflared service is not running on this VM" >&2

docker image prune -f >/dev/null
