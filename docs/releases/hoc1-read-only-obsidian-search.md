# HOC-1 Read-only Obsidian Search

**Date:** 2026-07-17  
**Branch:** `codex/hermes-obsidian-content-radar-v0.1`  
**Baseline:** `main@63486c4` / `v0.5.3-minimal-create-workbench-ok`

## Scope

HOC-1 adds a local, read-only material index and search CLI plus a Hermes Skill source and installed runtime copy. It does not create schedules, generate drafts, write to Content OS, change the collector plugin, move material, or publish content.

## Allowed Root

The scanner accepts one configured root only:

```text
笔记同步助手/
```

Its configured Vault is local-only under `~/.hermes/data/qixin-content-radar/config.json`; that configuration is not in Git. The scanner rejects absolute paths, `../` traversal, symlink paths, non-whitelisted roots, ignored folders, and non-Markdown files.

## Material Format

The first scan indexed 190 Markdown files, including one oversized file recorded as metadata only. The collector's common Frontmatter mapping is:

| Material property | Resolution order |
|---|---|
| Title | `title` -> first H1 -> filename |
| Source URL | `url` -> `source_url` -> `original_url` -> `link` |
| Author | `author` -> `creator` -> `username` |
| Saved time | `saved` -> `created_at` -> `date` -> file mtime |

Platforms are inferred locally from the stored source URL. The public search response exposes only relative paths, a maximum 800-character cleaned excerpt, provenance, and matching reasons. It does not expose absolute paths or execute any material text.

## Index And Scan

- Sidecar directory: `~/.hermes/data/qixin-content-radar/`, outside the repository and Content OS SQLite.
- Index: `index.json`, containing 190 items and no absolute filesystem paths.
- Fresh scan: `added: 190`, `errors: 0`.
- Final repeat scan: `unchanged: 190`, `added: 0`, `updated: 0`, `removed: 0`.
- The scanner compares relative path, mtime, size, and SHA-256 content hash. Removed material is removed from the sidecar index only.

## Search Quality

Search is local and explainable: complete phrase and title matches rank highest, then tags, author/source metadata, and body keywords. Multi-term queries require sufficient matching terms; absent topics return an empty array rather than broad keyword guesses.

| Topic | Result | Human assessment |
|---|---:|---|
| AI 影视生产流程 | 5 | At least 3 relevant or partially relevant |
| GEO | 5 | 5 relevant |
| Content OS | 0 | No exact material in this library |
| 装修行业获客 | 1 | Partially relevant only |
| AI 写真或摄影 | 4 | 4 relevant or partially relevant |

The required four-of-five topic threshold is **not met**: three topics pass. An impossible-topic query returns zero results. One locally present author identifier and its `x.com` URL identifier each return one result.

## Hermes Skill

Source is in `integrations/hermes/obsidian-content-radar/`; runtime copy is installed at:

```text
~/.hermes/skills/qixin/obsidian-content-radar/
```

The installer supports `--dry-run`, backs up a same-named existing Skill, copies Skill source only, and does not copy the real configuration or credentials. Hermes was found locally, but no documented built-in Skill validation command could be confirmed, so no validation command was guessed.

The Skill supports explicit searches and `看来源 N`. It does not support scheduled recommendations, draft generation, automatic saves, Obsidian writes, Content OS database writes, or publishing.

## Security Boundaries

- Material text is untrusted data, including prompt-injection wording and code blocks.
- The parser removes script/style and hidden HTML from excerpts; article text is never executed.
- Attachments are not followed or fetched.
- URLs are display-only provenance and are never automatically visited.
- CLI stdout is JSON; diagnostics are emitted to stderr. Node currently emits a module-type warning to stderr when directly executing TypeScript, but it does not contaminate JSON stdout.
- Tests cover configuration failures, whitelist and symlink escapes, parser fallbacks, URL/platform mapping, oversized files, incremental changes/removals, Chinese ranking, no-result behavior, JSON output, prompt-like material, and installer dry-run.

## Acceptance Status

`pending_user_weixin_acceptance`

The installed Skill's fixed CLI path was verified locally with an empty-result query. No automatic WeChat message was sent. Manual WeChat acceptance should send:

1. `我收藏过哪些关于 AI 影视流程的内容`
2. `从素材库找 GEO`
3. `看来源 2`

Then send one known-empty topic and confirm no absolute path, fabricated result, material execution, or Obsidian change occurs.

## Zero-Modification Proof

Before and after HOC-1:

- Allowed-root Markdown count remained 190.
- Ten deterministic sample SHA-256 values matched.
- Allowed-root directory mtime remained unchanged.
- Content OS database remained SHA-256 `dac5fa9e9643af9997f9e834758e11c012b05bacb725cf212aa8326db85297df`, size `258048`, and mtime `1783936224`.
- Database counts remained: VoiceSample 7, PublicationPackage 1, PublicationExport 3, EditorialDraft 4, DraftRevision 7.

## Recommendation

Do **not** enter HOC-2 yet. Complete WeChat user acceptance and improve or broaden the material library so the five-topic relevance threshold can pass without weakening the no-result contract.
