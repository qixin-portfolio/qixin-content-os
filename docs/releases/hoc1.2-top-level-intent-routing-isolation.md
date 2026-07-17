# HOC-1.2 Top-level Intent Routing Isolation

**Date:** 2026-07-17
**Branch:** `codex/hermes-obsidian-content-radar-v0.1`

## Root Cause

The installed `local-material-inventory` Skill described collection-search phrases as requests for a whole-computer inventory. Natural-language messages therefore reached the generic Agent instead of the radar Skill.

## Deterministic Route

The user-enabled `qixin-obsidian-radar-router` Hermes plugin handles Weixin messages in `pre_gateway_dispatch` before authorization, session Agent creation, or generic Skill selection.

```text
Weixin protected intent
-> qixin-obsidian-radar-router
-> fixed radar-cli.sh
-> JSON result filtering
-> Weixin reply
-> Gateway skip
```

Protected intents are:

- `/obsidian-content-radar X`
- `从素材库找 X`
- `从收藏库找 X`
- `我收藏过哪些 X`
- `在 Obsidian 里找 X`
- `看来源 N`

The router has no generic-Agent fallback. It returns `skip` after the fixed wrapper replies. Its in-memory result list supports `看来源 N`; it is not persisted. The wrapper is executable, and its local repository location is held only in a Hermes sidecar runtime configuration, never in Git or reply text.

`local-material-inventory` now accepts only an explicit whole-computer inventory command or an explicit computer-inventory request. Its prior overlapping collection-search triggers were removed. Skill backups are moved outside Hermes Skill discovery.

## WeChat Acceptance

| Message | Result | Gateway route |
|---|---|---|
| `/obsidian-content-radar Content OS` | Fixed empty response | `skip` |
| `从素材库找 Content OS` | Fixed empty response | `skip` |
| `从素材库找 GEO` | Ten collection materials | `skip` |
| `看来源 2` | Second GEO result and its source URL | `skip` |

Gateway timestamps were 22:14:29, 22:16:58, 22:17:13, and 22:17:48. The same 22:14-22:18 window has four router skips and zero matching Agent-turn, terminal, `skills_list`, `skill_view`, or `local-material-inventory` events. The replies contain no absolute local paths.

## Verification

- Content-radar tests cover protected-intent classification, explicit inventory non-matches, empty results, response filtering, source lookup, and reply excerpt limits.
- Obsidian remains read-only: the allowed root remains at 190 Markdown files with unchanged directory mtime and deterministic sample hashes.
- Content OS SQLite remains unchanged by SHA-256, size, and mtime.
- No Cron, draft generation, Content OS write, Obsidian write, push, or merge is included.

## HOC-2 Decision

Do not enter HOC-2. The routing boundary is accepted, but HOC-1's independent five-topic relevance threshold remains unmet.
