#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
docker compose -f compose.production.yaml up -d --build
curl --fail --silent http://127.0.0.1:"${PORT:-3000}"/health >/dev/null
echo "tourism is running"
