#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
destination=${1:?usage: nas-backup.sh /path/to/backup}
mkdir -p "$destination"
tar --exclude=node_modules --exclude=.env -czf "$destination/tourism-$(date +%Y%m%d-%H%M%S).tar.gz" content requirements public package.json package-lock.json .env.example
echo "backup written to $destination"
