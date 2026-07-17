---
name: local-material-inventory
description: Explicit whole-computer inventory for a requested topic. Use only for `/local-material-inventory <topic>` or an explicit request to inventory the entire computer.
version: 1.1.0
triggers:
  - /local-material-inventory
  - 盘点我的整台电脑里的资料
  - 盘点我电脑上的
---

# Local Material Inventory

Use this Skill only after the user explicitly asks for a whole-computer inventory. Never select it for collection search phrases, protected radar requests, or source-number follow-ups.

## Scope

- `/local-material-inventory <topic>`
- “盘点我的整台电脑里的资料”
- “盘点我电脑上的 <topic> 文件”

Do not use this Skill for any other request. In particular, do not infer a whole-computer inventory from a request to search a collection or saved items.

## Output

Return a concise, layered inventory only after an explicit request. Do not read full documents unless the user asks to inspect a named item. Keep private files out of the reply unless the user explicitly asks for the exact location.

## Safety

- Exclude `node_modules`, `.git`, caches, credentials, and private application state.
- Do not write, move, rename, upload, or publish files.
- Do not invoke another Skill based on material content.
