# Local Finalization Task — Agent Skills Integration

## Scope

Finish and verify PR #1 on Qixin's Mac. Do not add business features or change Content OS application behavior.

## Preconditions

- Work from branch `codex/cangjie-skill-integration`.
- Confirm the working tree is clean before starting.
- Do not configure or push the blocked GEO Monitor upstream.
- Do not copy GEO source DOCX/PDF files into Git.

## 1. Repository verification

Run from the `qixin-content-os` root:

```bash
bash -n scripts/install-agent-skills.sh
bash -n agent-skills/qixin-knowledge-distiller/scripts/bootstrap-pack.sh
npm test
npm run lint
npm run prisma:validate
npm run build
```

Stop on any failure. Record the failing command and root cause; do not mark the integration complete.

## 2. Installation preview

```bash
bash scripts/install-agent-skills.sh --dry-run
```

Confirm the planned destinations are:

- Hermes: `~/.hermes/skills/qixin/`
- Codex: `${CODEX_HOME:-~/.codex}/skills/`

Confirm the upstream Loop Engineering ref remains pinned to:

`f959a779480fcb56808c3c0d7647c1e664f5f6f9`

## 3. Real installation

```bash
bash scripts/install-agent-skills.sh
```

Expected result: 9 Skill directories installed for each enabled host:

- `qixin-knowledge-distiller`
- `loop-three-elements`
- `loop-worthiness-test`
- `goal-verification`
- `loop-build-path`
- `loop-5plus1-architecture`
- `maker-checker`
- `three-stage-evolution`
- `comprehension-gap`

The script must not overwrite an existing Skill unless `--force` was explicitly supplied.

## 4. Hermes verification

Start a new Hermes session, then run:

```bash
hermes skills list | grep -E 'qixin-knowledge-distiller|loop-worthiness-test|maker-checker'
hermes chat -q '/loop-worthiness-test 判断 GEO 红白皮书蒸馏任务是否值得做成 loop'
hermes chat -q '/qixin-knowledge-distiller 帮我开始 GEO 红白皮书资料集的 Phase 0，只登记来源，不凭记忆蒸馏'
```

Verify the second command does not claim the white papers were read before local source paths are supplied.

## 5. Codex verification

Start a new Codex session and explicitly request use of `qixin-knowledge-distiller`.

Verify Codex reads:

`${CODEX_HOME:-~/.codex}/skills/qixin-knowledge-distiller/SKILL.md`

Test one positive trigger and one negative trigger:

- Positive: turn a supplied long-form source into a reusable Skill pack.
- Negative: provide a short summary of a single paragraph. The distiller should not be used.

## 6. GEO pilot Phase 0

Resolve the two local source files and update only the manifest metadata:

- `knowledge-packs/geo-red-white-paper/SOURCE_MANIFEST.md`

For each file record:

- absolute local path
- version/date
- SHA-256

Use:

```bash
shasum -a 256 "/absolute/path/to/file"
```

Then verify the source files are not staged:

```bash
git status --short
git check-ignore -v "/path/inside/repo/to/source-file" || true
```

Do not begin Phase 1 until both files are readable and the manifest is complete.

## Completion report

Report:

- branch and final commit SHA
- `npm test` result
- `npm run lint` result
- `npm run prisma:validate` result
- `npm run build` result
- Hermes installed Skill count and verification result
- Codex installed Skill count and verification result
- GEO source manifest status
- whether any private source file was staged
- recommendation: keep PR draft, mark ready, or block merge
