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
hermes_home="${HERMES_HOME:-$HOME/.hermes}"
target="$hermes_home/plugins/qixin-obsidian-radar-router"
backup_root="$hermes_home/plugin-backups/qixin"
inventory_target="$hermes_home/skills/qixin/local-material-inventory/SKILL.md"
inventory_template="$source_dir/templates/local-material-inventory-SKILL.md"
runtime_dir="$hermes_home/data/qixin-content-radar"
runtime_config="$runtime_dir/router-runtime.json"
repo_root=$(CDPATH= cd -- "$source_dir/../../../../" && pwd)

if [ "$dry_run" = true ]; then
  echo "dry-run: install $source_dir to $target"
  if [ -e "$target" ]; then echo "dry-run: backup existing $target outside plugin discovery"; fi
  if [ -f "$inventory_target" ]; then echo "dry-run: update local-material-inventory routing contract"; fi
  exit 0
fi

mkdir -p "$(dirname -- "$target")" "$backup_root"
if [ -e "$target" ]; then
  backup="$backup_root/qixin-obsidian-radar-router-$(date +%Y%m%d%H%M%S)"
  mv "$target" "$backup"
  echo "backed up existing router plugin to $backup" >&2
fi

cp -R "$source_dir" "$target"
if [ ! -f "$target/plugin.yaml" ] || [ ! -f "$target/__init__.py" ]; then
  echo "router plugin installation failed" >&2
  exit 1
fi

if [ -f "$inventory_target" ]; then
  inventory_backup="$backup_root/local-material-inventory-SKILL-$(date +%Y%m%d%H%M%S).md"
  cp "$inventory_target" "$inventory_backup"
  cp "$inventory_template" "$inventory_target"
  echo "updated local-material-inventory routing contract" >&2
fi

mkdir -p "$runtime_dir"
printf '{\n  "contentOsRepo": "%s"\n}\n' "$repo_root" > "$runtime_config"

if command -v hermes >/dev/null 2>&1; then
  hermes plugins enable qixin-obsidian-radar-router
else
  echo "Hermes command not found; plugin copied but not enabled." >&2
  exit 1
fi

echo "installed and enabled $target" >&2
