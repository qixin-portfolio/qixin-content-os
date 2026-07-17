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
repo_root=$(CDPATH= cd -- "$source_dir/../../../.." && pwd)
hermes_home="${HERMES_HOME:-$HOME/.hermes}"
skill_target="$hermes_home/skills/qixin/content-remote-bridge"
plugin_target="$hermes_home/plugins/qixin-content-remote-bridge"
backup_root="$hermes_home/plugin-backups/qixin"
runtime_dir="$hermes_home/data/qixin-content-bridge"
runtime_file="$runtime_dir/runtime.json"

if [ "$dry_run" = true ]; then
  echo "dry-run: install remote bridge Skill and plugin"
  echo "dry-run: owner allowlist is configured only from HERMES_CONTENT_BRIDGE_OWNER_CHAT_ID"
  exit 0
fi

mkdir -p "$(dirname -- "$skill_target")" "$(dirname -- "$plugin_target")" "$backup_root" "$runtime_dir"
for target in "$skill_target" "$plugin_target"; do
  if [ -e "$target" ]; then
    backup="$backup_root/$(basename "$target")-$(date +%Y%m%d%H%M%S)"
    mv "$target" "$backup"
    echo "backed up existing runtime outside discovery" >&2
  fi
done
cp -R "$source_dir" "$skill_target"
cp -R "$source_dir/router-plugin" "$plugin_target"
chmod 755 "$skill_target/scripts/content-remote-cli.sh"

node -e '
const crypto = require("node:crypto");
const fs = require("node:fs");
const [file, repo, owner] = process.argv.slice(1);
let previous = {};
try { previous = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
const salt = typeof previous.chatHashSalt === "string" && previous.chatHashSalt ? previous.chatHashSalt : crypto.randomBytes(32).toString("hex");
const allowed = owner ? crypto.createHash("sha256").update(`${salt}:${owner}`).digest("hex") : (previous.allowedChatIdHash || "");
fs.writeFileSync(file, `${JSON.stringify({ contentOsRepo: repo, chatHashSalt: salt, allowedChatIdHash: allowed }, null, 2)}\n`, { mode: 0o600 });
' "$runtime_file" "$repo_root" "${HERMES_CONTENT_BRIDGE_OWNER_CHAT_ID:-}"

if command -v hermes >/dev/null 2>&1; then
  hermes plugins enable qixin-content-remote-bridge
else
  echo "Hermes command not found; runtime copied but plugin not enabled." >&2
  exit 1
fi
echo "installed remote bridge; owner allowlist configured=$([ -n "${HERMES_CONTENT_BRIDGE_OWNER_CHAT_ID:-}" ] && echo true || echo false)" >&2
