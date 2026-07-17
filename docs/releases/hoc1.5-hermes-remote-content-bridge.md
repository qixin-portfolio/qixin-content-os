# HOC-1.5 Hermes Remote Content Bridge

**Date:** 2026-07-17
**Branch:** `codex/hermes-remote-content-bridge-v0.1`
**Base:** `e8dfe278144ece4100f9a6ea3067d1c41cc29ec0`
**Status:** `pending_user_weixin_acceptance`

## Scope

HOC-1.5 adds a fixed Weixin content-creation bridge. It does not create an HOC-2 schedule, deploy a public web page, open `/create`, start a Next.js server, publish content, write Obsidian, or write Content OS SQLite.

```text
Weixin
-> pre_gateway_dispatch
-> qixin-content-remote-bridge
-> fixed content-remote-cli.sh
-> existing Content OS generation service
-> FactLedger and quality checks
-> Weixin reply
```

The bridge uses only the existing Ark provider and requires `doubao-seed-character-260628`. It reuses the existing topic generator, fact questions, sparse/enriched detail modes, request-local FactLedger, external-opinion attribution, three draft shapes, rejection of unsupported details, and one directed repair per rejected draft type. It does not recreate prompts inside a Hermes Skill and never falls back to template output.

## CLI Contract

The local-only commands read JSON from stdin and return one JSON object on stdout:

- `npm run content:remote-topics`
- `npm run content:remote-drafts`
- `npm run content:remote-health`

The fixed Hermes wrapper calls the Node CLI directly so package-manager banners cannot contaminate JSON stdout. Errors return a nonzero exit code and a safe JSON error. Prompts, API keys, FactLedger entries, fact IDs, and internal quality reasons are never returned.

The health check requires both the Ark model configuration and an owner chat hash. It reports `databaseWrites: false`; the bridge reads approved VoiceSample style data only.

## Deterministic Weixin Routing

Protected natural-language and slash intents enter the bridge before generic Agent creation:

- `这件事能写什么：<素材>`
- `给我三个内容方向：<素材>`
- `帮我想三个选题：<素材>`
- `/content-direction <素材>`
- `/content-create <素材>`

The router returns Gateway `skip`, calls only the fixed wrapper, and has no generic-Agent or local-file-search fallback. `从素材库找 GEO` and `看来源 N` remain with the Obsidian radar router.

`选 1/2/3`, `换一批`, `取消`, `直接写短一点`, `生成三版`, and fact-answer messages are handled only inside an active bridge session. A selection without an active session receives a fixed failure reply.

## Session And Material Handoff

Sessions are stored outside Git at `~/.hermes/data/qixin-content-bridge/sessions/` with a salted `chatIdHash`, source input, authorized material metadata, topics, selected topic, questions, answers, detail mode, stage, creation time, and 24-hour expiry. They never store an API key, prompt, absolute local path, or Content OS database ID.

The installer accepts `HERMES_CONTENT_BRIDGE_OWNER_CHAT_ID` only during local setup and persists only its salted hash. Until it is bound, the bridge fails closed and does not create a generic Agent.

After an authorized radar `看来源 N`, the radar router writes a 24-hour handoff containing only `sourceId`, title, author, source URL, and excerpt. `基于这条素材给我三个内容方向` can consume that handoff. It cannot receive a filesystem path. External material is forced into the existing FactLedger as `external_opinion`, so the generation service requires visible external attribution.

## Safety

- Local paths, traversal, Downloads, and private backups are rejected.
- Material instructions and code remain untrusted text and cannot alter the fixed tool chain.
- The reply filter removes local filesystem markers.
- Only approved owner-chat traffic can invoke the bridge.
- No automatic save, publication, Obsidian write, SQLite write, full-computer scan, or browser automation is included.

## Verification

Focused bridge and radar regression tests cover deterministic natural-language and slash routing, no generic route selection, session expiry/cancel, selection failure, source-handoff shape, local-path rejection, prompt-injection containment, sparse/enriched modes, external attribution, missing configuration, no fallback, initial provider calls, directed repair, partial visible drafts, and response field filtering.

## User Weixin Acceptance

Owner allowlist binding and real Weixin acceptance remain pending. After Gateway reload, send:

1. `这件事能写什么：最近给 Hermes 接 Obsidian 内容雷达，真正麻烦的不是搜索，而是防止 Agent 自己扩大检索范围。`
2. `从素材库找 GEO` then `看来源 2` then `基于这条素材给我三个内容方向`
3. `这件事能写什么：今天在外面出差，没法打开 Content OS，但突然发现微信才应该是我真正的入口。`

For each flow, choose a topic and either answer facts or reply `直接写短一点`. Confirm no added facts, no external-opinion ownership loss, no local path, no full-computer search, no database write, and no publication.

## Runtime Requirements

- The Mac must be powered on and online.
- Hermes Gateway must be running.
- Deep sleep makes the local bridge unavailable.
- A Next.js development server is not required.
