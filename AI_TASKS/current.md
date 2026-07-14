# Current Task | Minimal Create Workbench Design

产品优先级已从继续扩展数据模型和后台能力，调整为“让齐鑫能理解并完成一次内容创作”。当前只设计 `/create`，不写代码。

## Design Scope

- 单页流程：选择来源 → 3 个选题 → 3 个朋友圈候选稿 → 单一编辑器 → 少量事实风险 → 复制。
- 来源只有最近项目、手动输入、X 长文收藏。
- X 来源固定定位为“X 长文收藏研究库——以 X 收藏长文为主、持续更新的动态外部研究资料源”。当前真实 TopicCandidate 为 0，必须显示空状态，不导入私有 manifest。
- SourceItem/Revision ID、hash、evidenceSnapshot、packageHash、PublicationExport、详细评分和完整检查单默认隐藏，只进入“来源与安全检查”折叠区。
- 透明工地只作为用户主动打开的“流程演示”案例，不预选、不进入首页默认选题。
- 设计规格：`docs/superpowers/specs/2026-07-14-minimal-create-workbench-design.md`。

## Boundaries

- 不修改 `src/`、Prisma schema、migration 或真实数据库。
- 不正式导入 164 篇 X 收藏资料或 30 条 TopicCandidate。
- 不开发自动发布，不进入 Phase 6B。
- 设计文档提交后等待齐鑫人工确认，再决定是否开始页面实现。

## Verification

- 本提交只包含产品设计文档和任务/交接记录，没有业务代码或数据模型改动。
- Phase 5.3 设计修订完成后，从 `main` 基线重新执行测试、Prisma、lint、TypeScript 和 build。
- 不运行 seed、Vault 扫描或真实资料导入。

# Previous Stable Work

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
