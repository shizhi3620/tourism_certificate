#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
docker compose -f compose.production.yaml down
