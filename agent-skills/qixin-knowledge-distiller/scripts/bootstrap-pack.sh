#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  bootstrap-pack.sh <pack-slug> <source-title> <source-type> <classification> [output-root]

Example:
  bootstrap-pack.sh geo-red-white-paper "GEO 红白皮书资料集" whitepaper internal ./knowledge-packs

classification: public | internal | confidential
USAGE
}

[[ $# -ge 4 && $# -le 5 ]] || { usage >&2; exit 2; }

pack_slug="$1"
source_title="$2"
source_type="$3"
classification="$4"
output_root="${5:-./knowledge-packs}"

if [[ ! "$pack_slug" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "Invalid pack slug: use lowercase letters, numbers, and hyphens." >&2
  exit 2
fi

case "$classification" in
  public|internal|confidential) ;;
  *) echo "Invalid classification: $classification" >&2; exit 2 ;;
esac

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skill_root="$(cd "$script_dir/.." && pwd)"
pack_dir="$output_root/$pack_slug"

if [[ -e "$pack_dir" ]]; then
  echo "Refusing to overwrite existing pack: $pack_dir" >&2
  exit 1
fi

mkdir -p "$pack_dir"/{candidates,rejected,skills}
updated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

sed \
  -e "s/{{PACK_TITLE}}/$source_title/g" \
  -e "s/{{PACK_SLUG}}/$pack_slug/g" \
  -e "s/{{SOURCE_TYPE}}/$source_type/g" \
  -e "s/{{CLASSIFICATION}}/$classification/g" \
  -e "s/{{UPDATED_AT}}/$updated_at/g" \
  "$skill_root/templates/PIPELINE_STATE.md.template" > "$pack_dir/PIPELINE_STATE.md"

cat > "$pack_dir/SOURCE_MANIFEST.md" <<MANIFEST
# Source Manifest — $source_title

- Pack slug: \`$pack_slug\`
- Source type: \`$source_type\`
- Classification: \`$classification\`
- Created at: \`$updated_at\`

## Local source files

Add absolute local paths, version metadata and SHA-256 values here. Do not commit confidential source files.

| File | Local path | Version/date | SHA-256 | Commit allowed |
|---|---|---|---|---|
| pending | pending | pending | pending | no |

## Intended uses

- pending

## Quotation and distribution rules

- Keep source materials local.
- Use only short quotations required for traceability.
- Do not publish confidential or customer-identifying material.
MANIFEST

for file in OVERVIEW.md verified.md INDEX.md GLOSSARY.md DIGEST.md; do
  printf '# %s\n\nStatus: pending\n' "${file%.md}" > "$pack_dir/$file"
done

cat > "$pack_dir/.gitignore" <<'IGNORE'
source/
raw/
*.pdf
*.epub
*.doc
*.docx
*.m4a
*.mp3
*.mp4
*.wav
*.srt
*.vtt
IGNORE

printf 'Initialized knowledge pack: %s\n' "$pack_dir"
printf 'Next: fill SOURCE_MANIFEST.md and complete Phase 0 before extracting candidates.\n'
