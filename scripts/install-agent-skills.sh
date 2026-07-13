#!/usr/bin/env bash
set -euo pipefail

LOOP_REPO_URL="https://github.com/kangarooking/loop-engineering-skill.git"
LOOP_REPO_REF="f959a779480fcb56808c3c0d7647c1e664f5f6f9"
LOOP_SKILLS=(
  loop-three-elements
  loop-worthiness-test
  goal-verification
  loop-build-path
  loop-5plus1-architecture
  maker-checker
  three-stage-evolution
  comprehension-gap
)

install_hermes=true
install_codex=true
dry_run=false
force=false

usage() {
  cat <<'USAGE'
Usage: scripts/install-agent-skills.sh [options]

Options:
  --hermes-only   Install only to Hermes
  --codex-only    Install only to Codex
  --dry-run       Print actions without changing files
  --force         Replace an existing installed copy
  -h, --help      Show help

Environment overrides:
  HERMES_SKILLS_DIR  Default: ~/.hermes/skills/qixin
  CODEX_SKILLS_DIR   Default: ${CODEX_HOME:-~/.codex}/skills
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --hermes-only) install_codex=false ;;
    --codex-only) install_hermes=false ;;
    --dry-run) dry_run=true ;;
    --force) force=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
local_skill="$repo_root/agent-skills/qixin-knowledge-distiller"
hermes_root="${HERMES_SKILLS_DIR:-$HOME/.hermes/skills/qixin}"
codex_home="${CODEX_HOME:-$HOME/.codex}"
codex_root="${CODEX_SKILLS_DIR:-$codex_home/skills}"

[[ -f "$local_skill/SKILL.md" ]] || { echo "Local skill missing: $local_skill" >&2; exit 1; }

run() {
  if $dry_run; then
    printf '[dry-run]'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

install_dir() {
  local src="$1"
  local dest_root="$2"
  local name="$3"
  local dest="$dest_root/$name"

  if [[ -e "$dest" ]]; then
    if ! $force; then
      echo "Already exists, skipping: $dest"
      return 0
    fi
    run rm -rf "$dest"
  fi

  run mkdir -p "$dest_root"
  run cp -R "$src" "$dest"
  echo "Installed $name -> $dest"
}

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/qixin-agent-skills.XXXXXX")"
cleanup() { rm -rf "$tmp_dir"; }
trap cleanup EXIT

if $dry_run; then
  echo "[dry-run] git clone --quiet $LOOP_REPO_URL $tmp_dir/loop-engineering-skill"
  echo "[dry-run] git -C $tmp_dir/loop-engineering-skill checkout --quiet $LOOP_REPO_REF"
else
  git clone --quiet "$LOOP_REPO_URL" "$tmp_dir/loop-engineering-skill"
  git -C "$tmp_dir/loop-engineering-skill" checkout --quiet "$LOOP_REPO_REF"
fi

install_for_target() {
  local target="$1"
  install_dir "$local_skill" "$target" "qixin-knowledge-distiller"

  local skill
  for skill in "${LOOP_SKILLS[@]}"; do
    local src="$tmp_dir/loop-engineering-skill/$skill"
    if $dry_run || [[ -f "$src/SKILL.md" ]]; then
      install_dir "$src" "$target" "$skill"
    else
      echo "Pinned upstream skill missing: $src" >&2
      exit 1
    fi
  done
}

$install_hermes && install_for_target "$hermes_root"
$install_codex && install_for_target "$codex_root"

if ! $dry_run && $install_hermes && command -v hermes >/dev/null 2>&1; then
  echo
  echo "Hermes verification:"
  hermes skills list | grep -E 'qixin-knowledge-distiller|loop-worthiness-test|maker-checker' || {
    echo "Skills copied, but Hermes list did not show every verification target. Start a new Hermes session and run: hermes skills list" >&2
  }
fi

echo
echo "Installation complete. Start new Hermes/Codex sessions before testing skill activation."
