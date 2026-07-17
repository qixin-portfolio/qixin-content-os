# HOC-1 Final Freeze: Read-only Obsidian Search

**Date:** 2026-07-17
**Branch:** `codex/hermes-obsidian-content-radar-v0.1`
**HOC-1 baseline:** `main@63486c4` / `v0.5.3-minimal-create-workbench-ok`
**Final conclusion:** `hoc1_read_only_search_accepted`

## Frozen Scope

HOC-1 provides a local, read-only search index and Weixin retrieval entry point for exactly one configured allowed root:

```text
笔记同步助手/
```

The sidecar index contains 190 Markdown materials. Its local runtime configuration, index, and source-session state are outside Git and outside Content OS SQLite.

HOC-1 does not include scheduled morning/evening recommendations, Content OS draft generation, automatic Obsidian writes, Content OS database writes, or automatic publishing.

## Issues Resolved

1. The initial Weixin natural-language request escaped the authorized collection scope and reached a whole-computer material inventory path.
2. The installed Skill runtime copy initially drifted from the source because the wrapper lacked executable permission.
3. `local-material-inventory` previously overlapped with collection-search phrases and could win generic Skill routing.
4. Empty radar results previously suggested leaving the authorized collection scope.

The Response Boundary Fix fixes the empty result to `当前授权的 Obsidian 收藏库中没有找到相关素材。` and permits only same-collection keyword refinement.

The deterministic `pre_gateway_dispatch` router now handles protected Weixin intents before generic Agent creation:

```text
Weixin protected intent
-> qixin-obsidian-radar-router
-> fixed radar-cli.sh
-> filtered result reply
-> Gateway skip
```

The protected intents are `/obsidian-content-radar X`, `从素材库找 X`, `从收藏库找 X`, `我收藏过哪些 X`, `在 Obsidian 里找 X`, and `看来源 N`. The router has no generic-Agent fallback. `local-material-inventory` now requires an explicit whole-computer inventory command or request.

## Runtime Freeze Check

Byte-for-byte source/runtime comparison passed for:

- `SKILL.md`
- `references/interaction-rules.md`
- `references/security-boundaries.md`
- `scripts/radar-cli.sh`
- `router-plugin/router.py`

The active same-named Skill count is one. Old Skill backups are outside `~/.hermes/skills/` discovery. There is no `radar:verify-skill` npm command; this freeze used the equivalent direct file comparison rather than adding a new command.

## Weixin Acceptance

| Message | Accepted behavior |
|---|---|
| `/obsidian-content-radar Content OS` | Fixed empty result in the authorized collection only |
| `从素材库找 Content OS` | Same fixed empty result in the authorized collection only |
| `从素材库找 GEO` | Ten indexed collection results |
| `看来源 2` | The second result from the preceding GEO result set and its source URL |

All four requests were handled by `pre_gateway_dispatch` and returned Gateway `skip`. The corresponding Gateway window contains no generic Agent creation, terminal invocation, `skills_list`, `skill_view`, `local-material-inventory`, or whole-computer search.

Source lookups use a per-chat, in-memory result session only. Session results are not persisted and source URLs are displayed as provenance only; they are not fetched.

## Security And Data Integrity

- All article content is untrusted input. Prompt-injection text, commands, and code blocks remain data and are never executed.
- The scanner rejects path traversal and symlink escape, reads only the configured allowed root, ignores attachments, and does not access external URLs.
- Replies filter absolute local path markers and do not expose a local filesystem path.
- Allowed-root evidence is unchanged: 190 Markdown files, unchanged directory mtime, and unchanged deterministic sample SHA-256 values.
- Content OS SQLite evidence is unchanged: SHA-256 `dac5fa9e9643af9997f9e834758e11c012b05bacb725cf212aa8326db85297df`, size `258048`, and mtime `1783936224`.
- Read-only database counts remain VoiceSample 7, PublicationPackage 1, PublicationExport 3, EditorialDraft 4, and DraftRevision 7.

No HOC-1 Cron job was created. Existing Hermes scheduled jobs are unrelated to this feature.

## Known Corpus Gaps

- Content OS: `corpus_missing`
- 装修获客: `corpus_insufficient`

These content gaps do not permit broadening the data source beyond the allowed root. HOC-2 remains out of scope for this freeze.
