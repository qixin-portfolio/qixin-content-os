# HOC-1.6 Authorized Project Context Reader

## Status

Design only. HOC-1.6 is not implemented by HOC-1.5.5. The current Remote Content Bridge has no project-directory read permission and must not claim that it has read project material.

## Goal

Add a separately authorized, deterministic, read-only project context reader for Weixin content creation. It may provide a small, attributable project context only after a fixed allowlisted reader returns successfully.

```text
Weixin explicit project-read command
-> deterministic project-context router
-> fixed read-only CLI
-> one allowlisted projectId root
-> approved document summaries
-> sourceId-based context handoff
-> Content OS generation service
```

There is no generic Agent decision, browser automation, terminal free-form command, fallback directory scan, or automatic project discovery in this flow.

## Project Registry

The reader uses a local configuration outside Git. Each entry has:

```json
{
  "projectId": "renovation-quote-system",
  "displayName": "装修公司自动报价系统",
  "allowedRoot": "configured locally only",
  "allowedFiles": [
    "README.md",
    "docs/**/*.md",
    "package.json"
  ],
  "maxFileSizeBytes": 102400
}
```

- Weixin and generated replies expose `projectId` and document `sourceId`, never `allowedRoot` or an absolute path.
- A `projectId` maps to exactly one allowlisted root.
- Unknown project IDs fail closed. A project display name is resolved only through this static registry, never by scanning local directories.

## Read Boundary

The fixed CLI receives structured JSON over stdin and accepts only a `projectId` plus an explicit approved document selector. It validates the root after resolving symlinks and rejects path traversal.

It may read only allowlisted Markdown, text, and explicitly named metadata files. It must reject:

- `.env` and every secret/config derivative;
- SQLite, Prisma data, exports, logs, backups, and private backup roots;
- `Downloads`, browser data, attachments, and arbitrary user directories;
- files outside the one resolved allowlisted root;
- files over the configured size limit.

The CLI never executes document content, package scripts, Markdown instructions, or external links. It does not modify file contents, names, mtimes, Git state, Obsidian, or Content OS SQLite.

## Output Contract

The reader returns JSON only on stdout. Each returned item contains:

```json
{
  "sourceId": "PRJ-renovation-quote-system-<content-hash>",
  "projectId": "renovation-quote-system",
  "title": "",
  "excerpt": "",
  "updatedAt": ""
}
```

The result contains no absolute path, full document body, secret, file tree, shell output, or unapproved file metadata. Logs go to stderr and include only operation category and source IDs.

## Provenance Contract

Only a successful fixed reader result may create `authorized_project_source` facts. The generation service must retain this status in its FactLedger and preserve project-source attribution in drafts.

The following are not project sources:

- a user saying that a project already exists: `user_provided`;
- a user asking the bridge to read a project: `unverified_request`;
- a model conclusion: `model_inference`.

Until an `authorized_project_source` exists, generation must reject claims such as “已读取”, “项目资料显示”, “根据项目文档”, “已有项目可供参考”, or “Codex 项目可看”. The bridge response is: “当前内容桥接没有项目资料读取权限，请补充真实项目信息或使用授权项目读取入口。”

## Weixin Interaction

The command is explicit:

```text
读取项目：装修公司自动报价系统
```

The router resolves that display name only against the configured registry and returns a preview of the authorized source IDs and document titles. A later explicit content request may consume only those source IDs for the same salted-chat session.

Natural language such as “去项目里看看”, “资料都在电脑里”, or “参考一下现有项目” never switches to computer-wide search. Before HOC-1.6 is implemented, it must fail closed with the project-read-permission reply.

## Acceptance Criteria

- One projectId cannot read another project's root.
- Symlink, `..`, `.env`, database, backup, and Downloads attempts are rejected.
- Reader stdout is valid JSON and contains only sourceId, title, excerpt, and updatedAt.
- No generic Agent, terminal free search, broad scan, Obsidian write, SQLite write, Cron, or publication occurs.
- Generated content can cite only successful `authorized_project_source` results and does not disclose local paths.
- A failed reader never upgrades `unverified_request` into an authorized source.
