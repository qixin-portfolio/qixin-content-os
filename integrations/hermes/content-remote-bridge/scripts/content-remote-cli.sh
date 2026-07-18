#!/bin/sh
set -eu

if [ "$#" -ne 1 ] || { [ "$1" != "topics" ] && [ "$1" != "drafts" ] && [ "$1" != "health" ]; }; then
  echo "usage: content-remote-cli.sh topics|drafts|health" >&2
  exit 64
fi

: "${CONTENT_OS_REMOTE_REPO:?remote content repository is not configured}"
cd "$CONTENT_OS_REMOTE_REPO"
exec node scripts/content-remote.cjs "$1"
