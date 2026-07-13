# Current Task

Phase 5.2 release review complete: Publishable Content Package & Manual Export 可发布内容包与人工导出。

## Completed

- 新增 `PublicationPackage`、`PublicationExport`、发布状态和导出格式；同一 approved 源 Revision + platform 只能有一个发布包。
- 创建服务校验完整批准链，在单事务中复制最终批准文本并冻结 SourceItem 证据快照；重复和并发创建返回已有包。
- `packageHash` 覆盖平台、标题、Hook、正文、CTA、源/批准 Revision ID、证据快照、事实边界、配图需求和初始检查单；递归排序对象 key，SourceItem 按 ID 排序。
- 事实边界明确区分 confirmed、unverified、prohibited 和 missing evidence；透明工地不增加上线、客户、用户或收入事实。
- 配图层只生成需求；没有 public Asset 时 `existingAssetIds` 为空，不声称已有真实截图。
- 检查单区分系统自动项和人工项。人工项未完成时可以导出，但不能标记 `published`。
- TXT、Markdown、JSON 都由内存响应导出，每次创建 `PublicationExport`；仓库内不落导出文件。
- 新增 `/publication`、`/publication/[packageId]` 与对应 API；最终文案只读，修改必须返回 Editorial Workbench 创建新 Revision。
- 真实透明工地包 `cmrj0tyan0000w2up9bs7mgoj` 已创建且重复创建幂等；三种格式完成验收，状态为 `exported`，未标记 `published`。
- Release Review 发现并修复：原 hash 覆盖不足、重复 published 会改写首次时间、状态可不安全回退、Markdown MIME 和下载文件名兼容性不足。
- 状态机禁止 `exported/published -> ready` 和 `archived -> published`；`published` 重放返回首次记录；导出状态只由成功导出事务写入。
- 两个独立进程、独立 PrismaClient 并发创建同一包，均返回可识别结果，最终仅一条；数据库复合唯一索引是最终边界。
- 实际 HTTP 下载与 Playwright 页面验收使用 `/tmp` 数据库副本，不增加真实库导出记录，不修改真实检查项。

## Verification

```bash
npm test
npm run prisma:validate
npm exec prisma generate
npm run lint
npm exec tsc -- --noEmit
npm run build
npm run prisma:seed
```

结果：20 个测试文件、85 个测试通过，其余门禁全部通过。migration 已在当前库副本和全新 SQLite 验证；raw SQL 重复执行明确失败于已存在表且不改变数据。seed 后仍为 7 条 VoiceSample、approved Draft、4 条 Revision、3 条真实 Export 和 0 条 Asset。没有再次调用真实批准稿。

详细结果：`docs/releases/v0.5.2-publication-package-release-review.md`。

当前建议冻结 Phase 5.2 基线，等待用户确认；修复与 release review commit 均不自行 push。不自动发布，不标记真实朋友圈为 published，不修改现有 7 条 VoiceSample。

## Current Task | Phase 6A Obsidian External Research Source & Topic Staging

已在稳定基线 `4c83e25` 创建分支 `codex/phase6a-obsidian-research-source`。本阶段只做只读扫描、候选暂存和人工审核边界：

- `SourceType.obsidian_vault`、`ProjectSource` Vault 元数据、`SourceItem` 相对路径/哈希/版本字段、`SourceItemVersion`、`ScanRun`、`TopicCandidate`、`TopicCandidateSource` 已加入 Prisma schema 和 migration。
- 扫描器位于 `src/lib/sources/obsidian/`，读取 Markdown、Frontmatter、双链、外链和附件引用；忽略隐藏/临时/冲突文件，正文只生成安全摘要，不复制附件，不保存 Vault 绝对路径。
- 风险隔离覆盖 `phone_number`、`wechat_contact`、`local_absolute_path` 等类型；审计报告清单只按相对路径使用。风险笔记不进入默认 SourceItem 候选。
- `/sources/obsidian` 展示 dry-run 摘要；`/topics` 展示外部选题；`/topics/[topicId]` 展示来源摘要、风险、证据缺口和人工审核字段。没有生成发布稿按钮。
- 真实 Vault dry-run：可见文件 1153（原审计总数 1155，忽略 2 个 `.DS_Store`）、Markdown 170、SourceItem 候选 164、隔离 5、重复 0、缺少来源 1、断链 0、缺少附件 0、TopicCandidate manifest 30。
- 与审计报告差异：新增隔离 1 篇含 Windows 本地路径的笔记；审计报告只在终端摘要列出 1 个电话图片、1 篇微信联系方式和 2 篇 Unix 本地路径。该额外风险未进入候选，因此仍得到保守候选 164。
- 临时 SQLite 验收：导入 164 个 SourceItem 候选和 30 个 TopicCandidate；重复导入不新增；TopicCandidate 关联 30 条；EventCard、VoiceSample 均为 0；版本和删除保留语义由测试覆盖。
- 真实数据库只读核验：VoiceSample 7、PublicationPackage 1、PublicationExport 3；Phase 6A migration 未应用到真实库，TopicCandidate 表不存在且 Obsidian SourceItem 为 0。没有运行真实 seed、没有写入真实业务表。

验证：`npm test` 92/92、`npm run prisma:validate`、`npm exec prisma generate`、`npm run lint`、`npm exec tsc -- --noEmit`、`npm run build`、临时库 `prisma:seed` 均通过。真实 Vault 只通过环境变量 dry-run；未修改 Vault、未复制附件、未 push、未进入 Phase 6B。
