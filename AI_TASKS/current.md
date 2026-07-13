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
