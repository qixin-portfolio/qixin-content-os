# Handoff

## 2026-07-12 | ChatGPT | Phase 0 baseline

Created the independent local repository scaffold, product specification, implementation plan, Prisma schema, fact-validation schema, tests and AI collaboration rules.

Remote GitHub repository has not been created because the current GitHub connector exposes repository file operations but no repository-creation action, and the runtime does not include the `gh` CLI.

## 2026-07-12 | Codex | Phase 1

完成真实事件卡到四平台内容草稿的核心流水线：

- Prisma SQLite 模型覆盖 Project、SourceItem、EventCard、MasterContent、PlatformVariant、Asset、PublishRecord，并保留必要 relation。
- `src/lib/content/fact-check.ts` 在证据说明、结果或个人感受缺失时阻止生成。
- `src/lib/ai/content-generator.ts` 使用 mock provider 生成结构稳定的母内容草稿。
- `src/lib/content/platform-adapter.ts` 只改变表达方式，不改写事实字段。
- `src/app/api/events/route.ts` 提供事件列表和创建接口，创建前调用事实检查。
- `src/app/events/page.tsx` 与 `src/app/events/new/page.tsx` 提供列表和人工录入入口。

验证结果：`npm test` 10/10、`npm run prisma:validate`、`npm run lint`、`npm run build` 均通过。

当前状态：Phase 1 已完成，等待确认，不进入下一阶段；未接入外部模型，未自动发布。

## 2026-07-12 | Codex | Phase 2

完成 Reality Import Layer：

- `ProjectSource` 已加入 Prisma schema，`ProjectSource` 关联 Project，SourceItem 可关联 ProjectSource。
- EventCard 增加 SourceItem 多对多关系；事件生成和 API 创建都要求来源素材可追溯。
- `/projects` 和 `/api/projects` 支持项目列表与创建。
- `/inbox/import` 和 `/api/inbox/import` 支持按项目导入 Markdown，原文默认 private。
- `src/lib/importers/markdown.ts` 保留 Markdown 原文并提取标题。
- `src/lib/importers/github.ts` 只请求指定 repository + commitSha，不自动扫描；GitHub 失败时返回明确错误。
- `src/lib/content/event-generator.ts` 只从带结构化事实字段的 SourceItem 生成 EventCard draft，缺字段返回 validation error。
- `prisma/seed.ts` 默认读取 `/Users/qixin/Documents/我的搞钱方向` 的透明工地资料，已写入 4 个项目、4 个 SourceItem 和 1 个 EventCard。

真实案例口径：EventCard 只记录“产品文档已形成、截图/后台/代码/真实项目案例仍待补证”，没有写入上线、客户、用户数量、收入或成果指标。

验证结果：`npm test` 18/18、`npm run prisma:validate`、`npm exec prisma generate`、`npm run lint`、`npm run build`、`prisma migrate diff --exit-code` 均通过。

已知限制：本机 Prisma 7.8 的 `migrate dev` 和 `migrate deploy` 在 schema engine 阶段返回空错误；migration SQL 由 `migrate diff` 生成并用 `db execute` 验证，不能将标准 migration deploy 写成已通过。

当前状态：Phase 2 已完成，等待确认，不进入 Phase 3；未自动发布。
