#!/bin/sh
set -eu

dry_run=false
if [ "${1:-}" = "--dry-run" ]; then
  dry_run=true
  shift
fi

if [ "$#" -ne 0 ]; then
  echo "usage: install.sh [--dry-run]" >&2
  exit 1
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
source_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
target_root="${HERMES_HOME:-$HOME/.hermes}/skills/qixin"
target="$target_root/obsidian-content-radar"

if [ "$dry_run" = true ]; then
  echo "dry-run: install $source_dir to $target"
  if [ -e "$target" ]; then echo "dry-run: backup existing $target"; fi
  exit 0
fi

mkdir -p "$target_root"
if [ -e "$target" ]; then
  backup="${target}.backup-$(date +%Y%m%d%H%M%S)"
  mv "$target" "$backup"
  echo "backed up existing Skill to $backup" >&2
fi

cp -R "$source_dir" "$target"
if [ ! -f "$target/SKILL.md" ]; then
  echo "installation failed: SKILL.md is missing" >&2
  exit 1
fi

if command -v hermes >/dev/null 2>&1; then
  echo "Hermes command found; no built-in Skill validation command is documented, so validation was not guessed." >&2
else
  echo "Hermes command not found; built-in Skill validation was not available." >&2
fi

echo "installed $target" >&2
