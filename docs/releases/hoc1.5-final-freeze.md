# HOC-1.5 Final Freeze: Hermes Remote Content Bridge

**Date:** 2026-07-18
**Branch:** `codex/hermes-remote-content-bridge-v0.1`
**Base:** `e8dfe278144ece4100f9a6ea3067d1c41cc29ec0`
**Final status:** `hoc1.5_remote_content_bridge_accepted_with_provenance_guard`

## Objective And Route

HOC-1.5 makes Weixin a fixed, remote entry for a fact-grounded Content OS creation flow:

```text
Weixin
-> pre_gateway_dispatch
-> fixed content bridge wrapper
-> existing Content OS generation service
-> FactLedger and quality checks
-> Weixin reply
```

The bridge creates directions, accepts a selected direction and real detail answers, then returns only the drafts that pass fact and quality checks. Its protected route returns Gateway `skip` before generic Agent creation. It has no generic-Agent choice, terminal free search, browser automation, full-computer scan, local-material-inventory fallback, or automatic routing to another tool.

## Model And Failure Boundary

The bridge uses the existing Ark provider and requires `doubao-seed-character-260628`. It is fail-closed: absent authorization, wrapper/runtime failure, model configuration failure, timeout, provider failure, or invalid model JSON returns a safe bridge failure rather than template output or another tool.

The first real runtime failure was correctly fail-closed. `contentOsRepo` had been calculated one directory too high, so the wrapper could not locate `scripts/content-remote.cjs`. The runtime-path fix corrected the installer root calculation, added the fixed health wrapper command, and logs only safe operational error categories.

## Sparse Draft Quality

Sparse personal notes received several rounds of quality corrections:

- mechanical long/medium/short shrinking was rejected;
- report-like abstraction and unsupported professionalized rewrites were rejected;
- system and entry-point roles were checked rather than treated as interchangeable;
- `immutableFacts`, `userConclusions`, `allowedInferences`, and `forbiddenAdditions` constrain model generation and the one allowed directed repair;
- every draft is checked individually before similarity comparison;
- failed drafts are hidden after at most one directed repair, rather than released to fill a three-draft quota.

The final real Weixin sparse-flow acceptance returned only one qualified concise draft. The other two drafts were hidden because they did not meet the fact and natural-language quality gate. This preserves the rule that fewer qualified drafts are preferable to invented or abstract drafts.

## Project Read Provenance Guard

The bridge previously treated a user request such as “you can read the project material” as ordinary fact-answer text. That could cause generated wording to imply that project material had already been read.

The provenance guard now separates:

- `user_provided`: a user explicitly says that a related project exists;
- `unverified_request`: a user asks the bridge to read project material;
- `authorized_radar_source`: an approved Obsidian radar handoff;
- `authorized_project_source`: reserved for a future successful fixed project reader;
- `model_inference`: a model inference, never an authorization upgrade.

An unverified project-read request remains outside verified FactLedger facts. It does not call the fixed CLI, start draft generation, read a project directory, or create a generic Agent. The Weixin response states that the bridge has not read project material and asks for user-provided project progress or a future authorized project-read entry.

HOC-1.5 does not implement `authorized_project_source` reading. HOC-1.6 is design only in [hoc1.6-authorized-project-context-reader.md](../design/hoc1.6-authorized-project-context-reader.md): it specifies a `projectId` registry, one allowlisted root per project, fixed read-only CLI, source-ID handoff, and no natural-language fallback to a computer-wide scan.

## Data And Automation Boundary

HOC-1.5 does not write Obsidian, Content OS SQLite, a draft record, a publication package, a publication export, or a schedule. It does not automatically save or publish content. No HOC-1.5 Cron job was created, and HOC-2 is not included.

Final integrity verification records:

- allowed Obsidian root: 190 Markdown files; directory mtime and combined SHA-256 unchanged;
- Content OS SQLite: SHA-256, size, and mtime unchanged;
- `VoiceSample=7`, `PublicationPackage=1`, `PublicationExport=3`, `EditorialDraft=4`, `DraftRevision=7`.

## Runtime Freeze

The active Bridge router, wrapper, installer, and Skill files match repository source byte-for-byte. The active Radar router, wrapper, installer, and Skill files also match source. There is one active Bridge Skill and one active Radar Skill; old backups are outside Hermes Skill discovery.

The configured Content OS repository is this branch checkout, so the remote content CLI, sparse realization, quality validator, and generation service run the frozen repository source.
