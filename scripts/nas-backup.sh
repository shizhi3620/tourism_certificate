#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
destination=${1:?usage: nas-backup.sh /path/to/backup}
mkdir -p "$destination"
files="Dockerfile compose.production.yaml .dockerignore scripts content requirements public package.json .env.example"
if [ -f package-lock.json ]; then files="$files package-lock.json"; fi
tar --exclude=node_modules --exclude=.env --exclude=.DS_Store --exclude=._* -czf "$destination/tourism-$(date +%Y%m%d-%H%M%S).tar.gz" $files
echo "backup written to $destination"
