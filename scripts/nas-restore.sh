#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
archive=${1:?usage: nas-restore.sh /path/to/tourism-backup.tar.gz}
tar -tzf "$archive" >/dev/null
tar -xzf "$archive"
echo "content restored; run scripts/nas-start.sh to restart"
