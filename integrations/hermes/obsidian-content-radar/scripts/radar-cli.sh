#!/bin/sh
set -eu

if [ -z "${CONTENT_OS_RADAR_REPO:-}" ]; then
  echo "CONTENT_OS_RADAR_REPO is required" >&2
  exit 1
fi

if [ ! -f "$CONTENT_OS_RADAR_REPO/package.json" ]; then
  echo "CONTENT_OS_RADAR_REPO is not a Content OS repository" >&2
  exit 1
fi

command=${1:-search}
shift || true

case "$command" in
  scan) exec npm --prefix "$CONTENT_OS_RADAR_REPO" run --silent radar:scan -- "$@" ;;
  search) exec npm --prefix "$CONTENT_OS_RADAR_REPO" run --silent radar:search -- "$@" ;;
  *) echo "usage: radar-cli.sh <scan|search>" >&2; exit 1 ;;
esac
