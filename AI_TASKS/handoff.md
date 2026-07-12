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

## 2026-07-12 | Codex | Phase 3

完成 Content Intelligence Layer：

- `ContentScore` 持久化五项评分和推荐级别；评分维度均为 0-20，总分为 0-100。
- `ContentAngle` 根据事件事实和评分生成个人成长、行业观察、公开构建、实践方法和商业实验角度；角度只改表达入口，不新增事实成果。
- `VoiceProfile` 保存四个平台的 mock 语气、偏好词、禁用词和写作规则。
- `generateMasterContentFromIntelligence` 使用 deterministic mock provider，要求完整事实、SourceItem 引用、已选角度和 VoiceProfile；`archive_only` 不生成。
- `MasterContent.factReferencesJson` 保存真实 SourceItem ID，已有母内容时 API 返回 `409`，不覆盖。
- 新增 `/opportunities`、`/opportunities/[eventId]` 及对应 API，保留人工选择角度和 VoiceProfile 节点。
- seed 为透明工地真实资料生成了 `74/100`、`combine_later` 的 ContentScore、5 个角度和 1 个 MasterContent draft；资料中的上线、客户、用户数量、收入和成果指标仍明确标记为不可确认。

验证结果：`npm test` 11 个测试文件、28 个测试通过；`npm run prisma:validate`、`npm exec prisma generate`、`npm run lint`、`npm exec tsc -- --noEmit`、`npm run build` 和 `npm run prisma:seed` 均通过。API smoke check 中两个 GET 返回 200，已有母内容的生成请求返回 409。

已知限制：本机 Prisma 7.8 的 `migrate dev`/`migrate deploy` 仍在 schema engine 阶段返回空错误；Phase 3 migration SQL 已用 `db execute` 验证。未接入外部模型、向量数据库、RAG、多 Agent、多模型路由或自动发布。

当前状态：Phase 3 已完成，等待用户确认；未进入 Phase 4，未执行 git push。

## 2026-07-12 | Codex | Phase 4

完成 Voice Calibration & Editorial Workbench：

- 新增 `EditorialDraft`、`DraftRevision`、`VoiceSample`、`StyleReview`，保留 MasterContent 到编辑层的只读边界。
- 新增 deterministic StyleReview：模板化开头、课程广告腔、过度总结、虚假确定性、情绪化标点/Emoji、VoiceProfile 禁用词；`salesToneScore` 数值越高表示营销腔越重。
- 新增 rewrite suggester，只提供建议，Hook 和 CTA 都允许为空；不自动扩写事实，不添加用户、收入、客户或成果。
- 新增 revision service：`ai_initial`、`ai_suggestion`、`human_edit`、`human_approval` 四类 revision 永久保留；批准前重新 StyleReview，低于 70 分需 overrideReason；批准后创建 `approved_draft` VoiceSample。
- 新增 `/editorial`、`/editorial/[draftId]`、`/voice/samples` 页面及对应 API，支持人工保存、采用建议、批准、拒绝、样本手动添加和启停。
- 透明工地干净临时库生成四个平台草稿。朋友圈初稿 StyleReview 为 78，命中泛化 Hook；采用“删除模板化 Hook”建议后生成 Revision 2，StyleReview 为 81，状态为 `editing`，没有执行批准，VoiceSample 数量为 0。

内容质量结论：事实边界通过，文案自然度仍需齐鑫人工判断。当前是规则校准，不是完整个人声音学习；未声称已经学会齐鑫语气。

验证结果：Phase 4 全部工程门禁和 seed 结果记录在 `docs/releases/v0.4.0-phase4.md`。未自动发布，未进入 Phase 5，未执行 git push。

## 2026-07-12 | Codex | VoiceSample 批量导入子任务

- 新增 `scripts/import-voice-samples.ts` 和 `npm run voice-samples:import`。
- 支持 `.csv`/`.json`，CSV 支持引号、逗号和换行正文；JSON 支持数组或 `{ samples: [] }`。
- 校验 platform、title、body、qualityRating、sourceType 和可选的 originalPublishedAt。
- `sourceType` 缺省为 `imported_post`；按平台和正文 SHA-256 hash 去重；已有样本不覆盖。
- 通过对应平台 VoiceProfile 关联导入样本；sourceImageName 保存为 sourceReferenceId，originalPublishedAt 保留在 notes。
- `--dry-run` 只读取并计算，不写数据库；实际导入前等待用户提供文件。

验证结果：导入专项 5 个测试通过；完整工程门禁将在本子任务完成前重新执行。未进入 Phase 5 其他功能，未执行 push。
