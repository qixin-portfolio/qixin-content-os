# HOC-0.1 Content Collector Path Discovery

**Date:** 2026-07-17  
**Mode:** Read-only audit  
**Baseline:** `main@63486c4` / `v0.5.3-minimal-create-workbench-ok`

## Scope

Read-only discovery was limited to:

- `/Users/qixin/Documents`
- `/Users/qixin/Library/Mobile Documents`
- `/Users/qixin/Library/CloudStorage`
- `/Users/qixin/.hermes`
- registered Obsidian Vault paths and Obsidian application configuration
- related Obsidian plugin, Hermes Skill, LaunchAgent, and Cron metadata

No Obsidian note, source library, database, Hermes configuration, robot configuration, or Cron entry was changed. No public link was fetched.

## Registered Vaults

Obsidian registers two Vaults:

1. `/Users/qixin/Documents/Obsidian Vault`
2. `/Users/qixin/Documents/了解陌生行业/Shanxi-Decoration-Industry`

The second Vault is the most recently opened according to Obsidian's local registry. No additional Vault was found in the audited iCloud or CloudStorage locations.

## Existing Content Library

The actual article collector output directory is:

```text
/Users/qixin/Documents/了解陌生行业/Shanxi-Decoration-Industry/笔记同步助手/
```

It contains 190 Markdown files. This directory is inside the second registered Vault, not `Qixin-Control-Room`.

### Markdown Contract

- 185 files have the common Frontmatter fields: `author`, `source`, `url`, `saved`, `tags`, and `id`.
- `url` is present in 185 files. Observed source domains: 183 `x.com`, one GitHub, and one Feishu Wiki domain.
- `source` metadata identifies 180 X items, three X items through an AI-organized flow, one GitHub item, and one WeChat item.
- All 190 files have non-empty post-Frontmatter bodies. Body size ranges from 65 to 4,357,589 characters, with a median of 4,526 characters. This proves local article bodies are stored; source-to-local completeness was not verified against the network.
- 47 files have an H1 title. The other 143 use the filename as the title fallback.
- There are 177 distinct original URLs. Eight URL groups have a second local copy; therefore the collector is normally one article per file, but URL-to-file is not strictly one-to-one.
- No duplicate full-file content hash was found.

### Screenshot Identifier Check

For the five supplied non-sensitive identifiers, two matching Markdown files were found in this collector directory. A separate Obsidian application index log also contains identifier matches, but it is not a source library. This confirms that at least part of the screenshot link flow has already produced local Markdown.

## Writer Discovery

The writer is not Hermes. The Vault has enabled Obsidian plugin `bijitongbu` and its local plugin state shows:

- a configured API key and endpoint, values redacted;
- a configured `folder` output setting;
- configurable attachment folder and automatic sync settings;
- 166 local Markdown path mappings and 1,221 media-reference mappings;
- one pending localization task.

The plugin implementation invokes Obsidian Vault create, modify, and adapter-write operations. Its configuration schema includes `folder`, `articleFolder`, `attachmentFolder`, `messageFolder`, filename templates, and Frontmatter templates. Therefore its output target is configurable through the plugin, but no setting was changed in this audit.

The Hermes Weixin account directory remains a gateway-state directory only. Hermes provides generic Obsidian and X skills, but no Hermes collector was found that writes these article Markdown files.

## Other Automation Checks

- No matching LaunchAgent was found among the eight existing user LaunchAgents.
- Hermes has four pre-existing prompt-based Cron jobs and no fixed command job related to this collector. Nothing was created or modified.
- No additional iCloud or CloudStorage Vault was found in the bounded search.

## Sensitive Data Handling

No API key, endpoint value, token, cookie, full article URL, article body, or private chat content is recorded in this report. Plugin credential fields are reported only as `configured` or `not configured`.

## Conclusion

**A. `existing_content_library_found`**

An existing content library is available and can be used as the HOC-1 read-only whitelist:

```text
/Users/qixin/Documents/了解陌生行业/Shanxi-Decoration-Industry/笔记同步助手/
```

`Qixin-Control-Room` can be completely excluded.

## Independent Library Assessment

The proposed `/Users/qixin/Documents/Qixin Content Library/` structure is still recommended as a future clean boundary, but it must not be created in HOC-0.1.

- The current collector can likely write to `00_收件箱` later because the plugin exposes a configurable folder template.
- A dedicated Vault is suitable: it separates external material from the industry project Vault and enables a simple read-only Hermes whitelist.
- Hermes can be granted read-only access to that dedicated library without any access to `Qixin-Control-Room`.
- Migration can preserve source provenance by retaining each file's existing Frontmatter and body unchanged. The plugin's URL-to-local mapping should be revalidated after any future move; no migration was performed.

## Recommended Next Step

Before HOC-1, confirm one of these operating boundaries:

1. Use the current `笔记同步助手/` directory as the sole read-only whitelist.
2. Change the collector output to a future `Qixin Content Library/00_收件箱` and migrate only after a separate approved plan.

HOC-1 must not start until this choice is confirmed.
