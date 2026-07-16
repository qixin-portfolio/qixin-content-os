# Handoff

## 2026-07-16 | Codex | Phase 5.3.4 Fact Enrichment Before Drafting

- Added the local-only fact-question step between topic selection and draft generation. Sessions persist `factQuestions`, `factAnswers`, and `detailMode`; sparse mode permits short drafts without fictional scene expansion.
- Drafts require `usedFacts` with literal user `sourceQuote` values. Concrete detail without an allowed quote is rejected per draft. One targeted repair is allowed for each failed type; passing drafts remain unchanged and rejected drafts are omitted from selectable output.
- Repair input contains only source text, supplied facts, mode, selected topic, failed type, and reason; it never contains passing draft text, VoiceSample text, internal title, or database ID. Focused tests cover the 15 required safety and partial-success behaviors.
- Real Ark acceptance reached `doubao-seed-character-260628` without fallback. A sparse passed; B sparse stayed grounded but had structurally similar drafts; A enriched and both C cases correctly rejected all candidates after the model returned non-literal source quotes. B enriched remains `pending_user_details` because Qixin has not supplied real details.
- A legacy localStorage session was initially treated as incompatible by the new session shape. Added a backwards-compatible migration and test. One already-loaded session entered the old empty-session path before this fix; do not claim that specific draft was recoverable.
- No Prisma schema/migration/database/VoiceSample/approved draft/publication state changed. Do not push, merge main, enter Phase 6B, or silently weaken the source contract.

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

## 2026-07-13 | Codex | Phase 5.1 Approval Idempotency

完成批准幂等与数据完整性保护：

- 原批准流程的 StyleReview、Revision、Draft 更新和 VoiceSample 分散写入；重复调用会重复生成批准产物，并发调用会在查询后写入阶段竞态。
- 新增 `DraftRevision.approvedSourceRevisionId @unique` 与 `VoiceSample.sourceRevisionId @unique`，幂等键均绑定被批准的源 Revision，不限制同一 EditorialDraft 的后续新版本再次批准。
- 批准服务先识别源 Revision，再在一个 Prisma 事务中完成 StyleReview、批准 Revision、Draft 状态/approvedAt 和 VoiceSample；失败全部回滚。
- 同进程并发由服务层锁串行化，数据库唯一索引作为最终完整性约束；重复调用返回第一次批准产物并标记为幂等命中。
- 增量 migration 已为真实 Revision `cmriuf11d0001bzup8q4s47tx` 和 VoiceSample `cmriuf11j0002bzup33f77jsz` 回填源 Revision `cmriuduaq0000efuptpdu0puj`。
- 真实库迁移和 seed 前后 VoiceSample 都为 7 条，内容不可变字段摘要哈希一致；没有再次批准真实稿件。

验证结果：16 个测试文件、53 个测试通过；Prisma validate/generate、lint、TypeScript、Next.js build、seed 均通过。干净临时 SQLite 从零执行全部 migration 通过。

当前状态：Phase 5.1 完成，等待确认；未开发自动发布，未 push。

## 2026-07-13 | Codex | Phase 5.1 Release Review

- `d89272a` 已推送并确认 `main/origin` 0/0 后开始审查。
- 真正跨实例测试使用两个独立 Node 进程和 PrismaClient，明确绕过模块级内存锁。首次运行复现第二个进程 `P1008 Operation has timed out`。
- 本地 hardening commit `ac97a63` 增加有限重试：只处理 `P1008/P2002/P2028/P2034` 和 SQLite locked/busy，最多 3 次；每次仍先按源 Revision 查询唯一批准产物。
- API 新增稳定字段 `approvalRevisionId`、`voiceSampleId`、`sourceRevisionId`；Route Handler 连续 5 次测试返回 `201, 200, 200, 200, 200`，approvedAt 和三组 ID 不变。
- 四个故障注入点分别覆盖 StyleReview、approval Revision、Draft approved 状态和 VoiceSample 写入，均确认整个事务回滚。
- 真实库只读核验：VoiceSample 仍为 7 条，真实 Draft 仍为 approved；样本、Draft、Revision 的内容摘要与迁移前备份一致。没有调用真实批准接口。
- migration 在真实库备份副本和全新 SQLite 均通过；SQL 不包含固定真实 ID；仓库未跟踪数据库、私有 CSV/JSON 或截图。

最终验证：17 个测试文件、59 个测试通过；Prisma validate/generate、lint、TypeScript、build、seed 均通过。建议冻结 Phase 5.1 批准完整性基线；不进入自动发布。hardening 和 release review commit 均未 push，等待用户确认。

## 2026-07-13 | Codex | Phase 5.2 Publication Package

完成可发布内容包与人工导出：

- 新增 `PublicationPackage` 和 `PublicationExport`。幂等键是 approved 源 Revision + platform，数据库复合唯一索引作为最终边界。
- 创建发布包时验证 EditorialDraft approved 状态、源 Revision、human_approval Revision 和四段文案一致性；复制最终文案，不修改 Draft、Revision、VoiceSample 或 SourceItem。
- 证据快照只保存 SourceItem ID、类型、标题、安全引用和内容 SHA-256，不保存完整私人原文或私人绝对路径；创建后不会随 SourceItem 变化。
- 事实边界、配图需求和检查单均为 deterministic 结构。没有 public Asset 时不声称已有配图；人工检查未完成时禁止标记 published。
- 新增 TXT、Markdown、JSON 内存导出和导出记录；重复导出允许新增记录，相同内容 hash 一致。没有在仓库内保存生成文件。
- 新增 `/publication`、`/publication/[packageId]` 和三个 API 路由。发布包页最终文案只读，修改需返回 Editorial Workbench。
- 真实透明工地包 ID：`cmrj0tyan0000w2up9bs7mgoj`；source Revision 与 approval Revision 分别为 `cmriuduaq0000efuptpdu0puj`、`cmriuf11d0001bzup8q4s47tx`。重复创建返回同一包，三种导出通过，状态仅为 `exported`，没有标记 published。
- migration 在真实库、真实库副本和全新 SQLite 通过。真实库迁移/seed/验收前后保持 7 条 VoiceSample、approved Draft、4 个 Revision、0 个 Asset，内容指纹一致；没有调用真实批准接口。

验证结果：19 个测试文件、73 个测试通过；Prisma validate/generate、lint、TypeScript、Next.js build、seed 均通过。当前未接入平台发布 API，不检测真实朋友圈发布结果，不进入下一阶段，不 push。

## 2026-07-13 | Codex | Phase 5.2 Release Review

- implementation `124a421` 已推送并确认 `main/origin` 0/0 后开始最终审查。
- 审查发现原 `packageHash` 未覆盖事实边界、配图需求和初始检查单，且状态接口会在重复 published 时改写 `publishedAt`。独立 fix `4fff19d` 已补齐 hash、状态机、HTTP 下载头与有限并发测试，未 push。
- 完整 hash 覆盖最终文案、源/批准 Revision ID、证据快照、事实边界、配图需求和初始检查单。对象 key 递归排序，SourceItem 按 ID 排序；后续检查、导出和发布记录不改变创建时 hash。
- 两个独立 Node 进程和 PrismaClient 同时创建同一包，最终只有一条；一个首次结果、一个幂等结果。数据库 `sourceRevisionId + platform` 唯一索引仍是最终正确性边界。
- 状态机只由成功导出写入 exported；禁止回退 ready，published 重放不改首次时间，published 可归档但 archived 不可直接恢复 published。人工项未完成或 API 直接绕过时拒绝 published。
- 三种实际 HTTP 下载在 `/tmp` 数据库副本验证：TXT 与批准正文逐字一致，Markdown/JSON 结构与 MIME 正确，RFC 5987 下载名存在，不含私人路径或密钥。真实数据库仍只有原 3 条 Export。
- Playwright 验证列表、只读详情、返回 Editorial Workbench、复制动作、三种导出按钮、证据、事实边界、配图需求、检查单和刷新后状态。没有勾选检查项，没有触发真实发布。
- 真实包只显式回填派生 `packageHash` 为 `d4ce1b84ab954996487ddb2b1e58018069d8f2bb23cbc90905e0d1c1ad89c058`；与审查前仓库外备份相比，VoiceSample、Draft、Revision、SourceItem、Asset、Export 均不变。

最终验证：20 个测试文件、85 个测试通过；Prisma validate/generate、lint、TypeScript、build、seed 均通过。建议冻结 Phase 5.2；不进入自动发布，fix 与 release review commit 不自行 push。
## 2026-07-14 | Codex | Minimal Create Workbench Design

产品方向从继续增加后台能力转为极简创作主线。本轮只新增 `/create` 产品线框与交互规格，不写页面代码、不修改数据模型或真实数据。

- `/create` 定义为单页稿纸式流程：来源、选题、候选稿、编辑、风险和复制逐段展开。
- 最近项目、手动输入、X 长文收藏均映射现有能力；X 收藏当前无真实已审核 TopicCandidate，必须显示空状态，不导入私有 30 条 manifest。
- 三稿和人工编辑只保存在浏览器会话状态；复制不暗中创建 Draft、Revision、VoiceSample、PublicationPackage 或 Export。
- 主界面隐藏 ID、hash、证据快照、发布导出和详细分数；技术信息进入二级折叠追溯。
- 透明工地从默认内容降级为主动打开的“流程演示”案例。
- 阻断级事实风险未解决时禁止复制；复制只写剪贴板并明确“未自动发布”。

规格文件：`docs/superpowers/specs/2026-07-14-minimal-create-workbench-design.md`。等待齐鑫确认，不进入实现、Phase 6B 或自动发布。

分支拆分后将从 `main` 基线重新执行工程验证。本提交不运行 seed、Vault 扫描或真实导入。

## 2026-07-14 | Codex | Phase 5.3 Minimal Content Creation Workbench

完成极简内容创作台 implementation：

- 根页面直接跳转 `/create`。主流程压缩为一句输入、三个选题、三版朋友圈草稿、单一人工编辑器和复制。
- 三个入口使用普通用户语言；最近项目只读现有可追溯事件，透明工地只在主动演示入口出现，X 收藏未接入时不伪造选题。
- 新增无持久化 `/api/create/topics` 和 `/api/create/drafts`。两条接口使用 deterministic 本地实现；草稿接口只读 VoiceProfile/VoiceSample，不新增任何数据库记录。
- VoiceSample 质量权重为 5 分高、4 分中高、3 分辅助，`approved_draft` 高于同分 `imported_post`；样本文本只参与风格检查，不进入生成模板或候选正文。
- localStorage 键为 `qixin-content-os:create-session:v1`，保存来源、选题、三稿、人工正文、提示、配图和步骤；支持刷新恢复、版本/损坏降级和确认清空。
- 轻量提示最多三条且不自动修改正文；来源与安全检查默认折叠，不显示内部 ID、hash 或详细评分。
- Playwright 使用指定 Content OS 输入完成桌面、390px 手机端、刷新、复制、清空和 X 空状态验收；手机端无横向溢出。

验证结果：25 个测试文件、99 个测试通过；Prisma validate/generate、lint、TypeScript、build 均通过。真实数据库仍为 7 条 VoiceSample、1 个 PublicationPackage、3 个 PublicationExport、4 个 EditorialDraft、7 个 DraftRevision；真实包未标记 published。

当前状态：Phase 5.3 implementation 等待齐鑫确认。设计基线已推送到功能分支；implementation commit 不 push，不合并 main，不进入 Phase 6B 或自动发布。

## 2026-07-14 | Codex | Phase 5.3.1 Non-Template Content Generation

齐鑫对 `7aae10f` 的真实三稿验收未通过：旧实现把输入插入固定开头、转折和结尾，三版只是同一结构的重排。已先完成模板根因审计，再按 TDD 修正生成层。

- 新链路为 ContentBrief -> 三个不同选题焦点 -> 三种叙事计划 -> 事实与相似度检查 -> 单次定向重试。
- ContentBrief 只保留原始输入信息；草稿服务会再次按 `sourceText` 收紧浏览器回传内容，阻止本地篡改加入新事实。
- VoiceSample 只读取正文，`approved_draft` 和高评分样本权重更高；提取结构画像，不向 Provider 发送样本原句或内部标题。
- 相似度覆盖首句、连续句、段落结构、结尾、抽象判断、仅长短变化和样本整句复制；重试不会覆盖人工 `editedContent`。
- 唯一真实 Provider 为火山方舟 `volcengine_ark`。Route 通过统一 factory 使用服务端 `ARK_API_KEY` 与 `ARK_MODEL_ID`；模型 ID 不猜测、不硬编码。
- 当前未配置 Ark 参数，未发生真实模型调用。五条指定输入已通过真实 `/create` 页面以 `deterministic_fallback` 验收，页面明确显示本地演示提示。
- fallback 五条均通过当前事实与结构检查；透明工地未写上线或客户成果，生活稿未升华，外部观点保留归属。但部分短稿仍机械，不能作为 Seed 2.1 或发布级效果结论。

当前状态：等待齐鑫配置火山方舟真实模型/推理接入点 ID 和 API Key 后，用最少调用次数做 Seed 2.1 真实验收。实现 commit 不自行 push，不合并 main，不进入 Phase 6B 或自动发布。

## 2026-07-15 | Codex | Phase 5.3.2 Ark Structured Output & Latency Hardening

Phase 5.3.1 真实 Ark 诊断确认网络、Key 和模型可用：直接 curl 为 HTTP 200、1.777 秒，Node 最小 Provider 调用为 HTTP 200、1.577 秒。旧 ContentBrief 请求在 113.402 秒后进入 ZodError，问题位于结构化生成协议和校验边界，不是基础网络连通性。

- topics 已合并为一次 `TopicGenerationEnvelope` 请求，同时返回 brief 和正好 3 条 topics；服务端继续按原始输入收紧事实。
- Ark 使用 `json_object`，响应只接受直接 JSON 或单一完整 Markdown JSON 围栏，随后经过 Zod。`json_schema` 没有可靠实测证据，本轮未猜测支持能力。
- 可空语义字段可规范化为空字符串，数组字段可将 null/缺失规范化为空数组、将单字符串转为单元素数组；不会补事实、情绪、判断、结果或下一步。
- 第一次结构失败只允许一次结构修复请求；第二次失败返回 `schema_validation_failed`。旧失败响应没有保留，后续一次安全诊断在收到响应前超时，因此无法诚实列出旧 Zod 的具体字段 path。
- drafts 初次生成一次返回 `scene_record`、`thought_progression`、`restrained_short` 三稿；只对质量失败版本定向重试一轮。
- Ark Provider 超时为 120 秒，Create Route 上限为 150 秒；响应超过 25/35 秒记录 slow_response。timeout、鉴权、模型、限流和 schema 错误均不自动 fallback。
- 缺少 Ark 配置也不再由 factory 静默选择 fallback。只有用户主动点击“使用本地演示生成”，Route 才直接创建本地 Provider，并显示模板风险提示。
- VoiceSample 仅用于提炼高质量结构画像：所有 5 分样本加最多两条 4 分样本；3 分样本、内部标题和完整正文不进入 Ark Prompt。

严格真实验收在第一步 `brief + topics` 停止：HTTP 504，120.399 秒，`classification=timeout`，`fallback=false`，没有得到可校验的 topics。按最少调用规则没有继续调用 drafts，因此不存在可汇报的真实三选题或三稿，25/35/60 秒延迟目标均未完成验证。

本阶段没有修改 Prisma schema、真实数据库、7 条 VoiceSample、已批准稿件或发布包，也没有把真实响应写入 Git。实现可作为结构协议与失败边界加固提交，但不能标记为真实生成稳定基线；不 push、不合并 main、不进入 Phase 6B。

工程验证：32 个测试文件、149 项通过；Prisma validate/generate、lint、TypeScript、build 均通过。真实库仍为 VoiceSample 7、PublicationPackage 1、PublicationExport 3、EditorialDraft 4、DraftRevision 7；数据库 SHA-256、mtime、大小与任务前基线一致。

## 2026-07-16 | Codex | Phase 5.3.3 Ark Latency Isolation & Minimal Generation Path

先对 Phase 5.3.2 当前 topics 请求做无网络审计：system 63 字、user 424 字、总计 487 字，约 217 tokens；未注入 VoiceSample 或声音摘要，使用 `json_object`、max_tokens 1000、stream=false，无 temperature/top_p/thinking/reasoning，原始输入只出现一次。

严格延迟矩阵使用同一模型且禁止 fallback：A 极小 JSON 为 HTTP 200、TTFB 1.965 秒、总耗时 1.966 秒；B 仅生成三个 topics、无 VoiceSample/ContentBrief，在 60.005 秒仍无 HTTP 响应。按规则未调用 C/D。证据表明基础 JSON 模式可用，B 超时与 VoiceSample 无关。

正式架构已改为本地 GroundingContext -> Ark 三选题 -> Ark 三稿 -> 本地安全检查。模型不再生成 ContentBrief；API 和 localStorage 也不再传递 brief。GroundingContext 保留原始输入与显式安全标记，不推断情绪、结果、下一步或场景。

- topics 初次只调用一次 Provider，只返回正好三条 topics。
- drafts 初次只调用一次 Provider、同时返回三稿；本地检查失败只返回 insufficient，不再自动二次生成。
- Prompt 预算 topics 4,000 字、drafts 6,000 字，声音摘要最多 600 字；不裁剪原始输入和事实保护规则。
- 当前聚合声音摘要 136 字；mock topics/drafts 请求分别 418/688 字，均未超预算，不含样本标题、正文或 ID。
- Provider timeout 降至 60 秒，Route 上限降至 75 秒。
- 自动 fallback 辅助入口已删除，只有用户明确点击本地演示后 Route 才直接选择 deterministic provider。

简化后严格真实 `/api/create/topics` 仍为 HTTP 504、60.249 秒、timeout、fallback=false，未获得 topics。按规则没有调用 drafts，因此不存在真实三选题或三稿，也未验证 90 秒完整流程。当前模型或调用方式不适合该交互场景，停止继续调 Prompt或增加 timeout。

真实数据库与 7 条 VoiceSample 未修改；不 push、不合并 main、不进入 Phase 6B。

最终工程验证：33 个测试文件、153 项测试通过；Prisma validate/generate、lint、TypeScript 和 Next.js build 均通过。真实数据库数量、SHA-256、mtime 和大小与任务前基线一致。
