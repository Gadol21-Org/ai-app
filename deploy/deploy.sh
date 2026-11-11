#!/usr/bin/env bash
# Runs on the VM: replaces the running Family AI container with the given image.
#   ai-app  published on 127.0.0.1:8084 of the VM only
# The cloudflared service on the VM forwards a public hostname to that port.
# Usage: deploy.sh <image>
set -euo pipefail

image="$1"
dir="$HOME/ai-app"
env_file="$dir/.env"
name=ai-app
host_port=8084

if [ ! -f "$env_file" ]; then
  echo "$env_file is missing; the workflow writes it from the AI_APP_ENV secret" >&2
  exit 1
fi

# Pull before stopping anything, so the app is down only for the swap.
docker pull "$image"

docker rm -f "$name" >/dev/null 2>&1 || true
docker run -d --name "$name" \
  --init \
  --restart unless-stopped \
  --log-opt max-size=10m --log-opt max-file=3 \
  -p "127.0.0.1:$host_port:3000" \
  --env-file "$env_file" \
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
