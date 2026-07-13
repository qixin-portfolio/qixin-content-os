# Current Task

Phase 5.2 complete: Publishable Content Package & Manual Export 可发布内容包与人工导出。

## Completed

- 新增 `PublicationPackage`、`PublicationExport`、发布状态和导出格式；同一 approved 源 Revision + platform 只能有一个发布包。
- 创建服务校验完整批准链，在单事务中复制最终批准文本并冻结 SourceItem 证据快照；重复和并发创建返回已有包。
- `packageHash` 覆盖平台、标题、Hook、正文、CTA 和证据快照，不以正文 hash 代替幂等键。
- 事实边界明确区分 confirmed、unverified、prohibited 和 missing evidence；透明工地不增加上线、客户、用户或收入事实。
- 配图层只生成需求；没有 public Asset 时 `existingAssetIds` 为空，不声称已有真实截图。
- 检查单区分系统自动项和人工项。人工项未完成时可以导出，但不能标记 `published`。
- TXT、Markdown、JSON 都由内存响应导出，每次创建 `PublicationExport`；仓库内不落导出文件。
- 新增 `/publication`、`/publication/[packageId]` 与对应 API；最终文案只读，修改必须返回 Editorial Workbench 创建新 Revision。
- 真实透明工地包 `cmrj0tyan0000w2up9bs7mgoj` 已创建且重复创建幂等；三种格式完成验收，状态为 `exported`，未标记 `published`。

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

结果：19 个测试文件、73 个测试通过，其余门禁全部通过。migration 已在当前库、当前库副本和全新 SQLite 验证；seed 后仍为 7 条 VoiceSample，真实 Draft、4 个 Revision 与 Asset 指纹不变。没有再次调用真实批准稿。

详细结果：`docs/releases/v0.5.2-publication-package.md`。

当前状态：Phase 5.2 实现完成，等待用户确认；不自动发布、不标记真实朋友圈为 published、不修改现有 7 条 VoiceSample，本 commit 不自行 push。
