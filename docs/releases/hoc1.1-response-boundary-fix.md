# HOC-1.1 Response Boundary Fix

**Date:** 2026-07-17
**Branch:** `codex/hermes-obsidian-content-radar-v0.1`

## Issue

An empty radar result previously included a suggestion to leave the authorized collection scope. That violated HOC-1's single data-channel contract.

## Fix

- The empty-result reply is fixed to: `当前授权的 Obsidian 收藏库中没有找到相关素材。`
- Optional follow-up wording remains limited to alternative keywords for the same collection.
- Skill and interaction rules prohibit naming another tool or location in a radar reply.
- Regression tests verify the fixed message, absence of alternate-route wording, source lookup preservation, and absolute-path redaction.

## Acceptance

The HOC-1.2 WeChat acceptance on 2026-07-17 confirmed both the slash command and the natural-language collection request return the fixed empty response for `Content OS`. No alternate search path was suggested or invoked.

## Scope

No Obsidian note, collector configuration, Content OS database, schedule, publication, or remote branch was changed.
