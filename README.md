# 齐鑫 Content OS

本地优先、证据驱动的个人内容分发中台。它把真实项目进展整理为事件卡、母内容和朋友圈、X、小红书、抖音四个平台版本。

## 当前阶段

Phase 5.2 已完成：已批准 EditorialDraft 可以转换为不可直接改写的人工发布内容包。内容包固定保存最终文案、批准链、证据快照、事实边界、配图需求和发布检查单，并支持 TXT、Markdown、JSON 人工导出；不连接任何平台发布 API。

Phase 6A 已完成实现：Obsidian 作为“X 长文收藏研究库”接入。它是以 X 收藏长文为主、持续更新的动态外部研究库，只提供只读 dry-run、SourceItem 候选和 TopicCandidate staging。外部观点默认 `unverified_reference`，不因目录名或来源平台推断主题与真实性，不进入 VoiceSample，不自动创建 EventCard/MasterContent，也不自动发布。

Obsidian dry-run：

```bash
OBSIDIAN_RESEARCH_VAULT_PATH="<VAULT_PATH>" npm run obsidian:dry-run
```

Vault 路径只从 `OBSIDIAN_RESEARCH_VAULT_PATH` 读取，不写入数据库。30 个人工提炼的选题 manifest 保存在仓库外的 `qixin-content-os-private-backups/import-manifests/topic-candidates-phase6a.json`；也可以用 `TOPIC_CANDIDATES_MANIFEST_PATH` 指定 manifest。页面为 `/sources/obsidian`、`/topics` 和 `/topics/[topicId]`。

Phase 0 基线包含：

- Next.js + TypeScript + Tailwind CSS
- Prisma + SQLite 数据模型
- Zod 内容事实约束
- Vitest 测试基线
- 设计规格与 V1 实施计划

事件接口：

- `GET /api/events`：获取事件卡列表
- `POST /api/events`：事实检查通过后创建事件卡；缺少证据、结果或个人感受时返回 `400`

项目与导入接口：

- `GET/POST /api/projects`：读取和创建项目
- `POST /api/inbox/import`：将 `.md`/`.markdown` 文件按项目导入为私有 SourceItem
- `/projects`：项目列表
- `/inbox/import`：Markdown 导入页面

内容机会接口与页面：

- `GET /api/opportunities`：获取 EventCard 内容机会和评分
- `GET /api/opportunities/[eventId]`：获取单个事件的评分、角度和证据
- `POST /api/opportunities/[eventId]/generate`：在人工选择角度和 VoiceProfile 后生成 MasterContent draft；已有母内容时返回 `409`，不覆盖
- `/opportunities`：内容机会列表
- `/opportunities/[eventId]`：评分、证据、角度和人工生成入口

人工编辑与声音接口：

- `GET/POST /api/editorial`：查看或从 MasterContent 准备四个平台 EditorialDraft；每个平台使用对应 VoiceProfile
- `GET/PATCH /api/editorial/[draftId]`：查看草稿和保存人工 revision
- `GET/POST /api/editorial/[draftId]/suggestions`：查看建议或明确采用建议生成新 revision
- `POST /api/editorial/[draftId]/review`：重新执行 StyleReview
- `POST /api/editorial/[draftId]/approve`：通过评分门槛后人工批准并沉淀 VoiceSample；首次创建返回 `201`，同一源 Revision 的幂等重放返回原批准结果和 `200`
- `POST /api/editorial/[draftId]/reject`：拒绝并保存原因
- `GET/POST /api/voice/samples`：查看或手动添加本人真实文案样本
- `PATCH /api/voice/samples/[id]`：修改评分、备注和启用状态
- `/editorial`、`/editorial/[draftId]`：人工编辑工作台
- `/voice/samples`：个人声音样本库

人工发布包接口与页面：

- `GET/POST /api/publication`：查看发布包，或从 approved EditorialDraft 创建发布包；首次创建返回 `201`，同一源 Revision + platform 的幂等重放返回 `200`
- `GET/PATCH /api/publication/[packageId]`：查看证据快照、更新人工检查项和人工发布状态
- `POST /api/publication/[packageId]/export`：导出 TXT、Markdown 或 JSON，并记录 `PublicationExport`
- `/publication`：发布包台账和 approved Draft 创建入口
- `/publication/[packageId]`：最终文案只读、证据与事实边界、配图需求、检查单和人工状态记录

初始化本地项目和真实透明工地资料：

```bash
npm run prisma:seed
```

seed 默认读取 `/Users/qixin/Documents/我的搞钱方向`，也可以通过 `CONTENT_OS_MATERIAL_ROOT` 指定资料根目录。资料缺失时 seed 会失败，不会生成替代内容。

内容生成使用 mock provider，所有平台版本仍需人工审核，不做自动发布。

Phase 3 的评分只用于排序和生成建议：`publish_now`、`combine_later`、`archive_only`。低分事件不会被删除；生成的 MasterContent 会保存 SourceItem ID 引用。

Phase 4 的编辑流程保留原始 MasterContent 和所有 DraftRevision。AI 建议只有在人工点击采用后才会生成 revision；批准前必须重新 StyleReview，`overallScore < 70` 时需要明确填写 override 原因。

Phase 5.1 的批准以被批准的源 DraftRevision 为幂等单位。StyleReview、`human_approval` Revision、EditorialDraft 状态更新和 `approved_draft` VoiceSample 写入同一个数据库事务；任何一步失败都会整体回滚。批准后继续人工编辑会创建新的源 Revision，该新版本仍可独立批准。

Phase 5.2 的发布包以 `sourceRevisionId + platform` 为幂等键。创建时的 `packageHash` 覆盖最终文案、批准链 ID、证据快照、事实边界、配图需求和初始检查单；后续勾选检查项、导出和人工发布状态不改变该 hash。TXT 只含最终可复制文案；Markdown 带人工检查材料；JSON 带结构化发布包。成功导出会把状态从 `ready` 记为 `exported`，但不会自动变为 `published`。只有全部人工检查项完成并填写 `publishedAt` 后，用户才能手动记录为已发布；首次时间不可被重复调用改写，朋友圈 URL 可为空。

VoiceSample 批量导入脚本：

```bash
npm run voice-samples:import -- --dry-run path/to/samples.csv
npm run voice-samples:import -- path/to/samples.json
```

脚本支持 CSV/JSON、字段校验、平台+正文 hash 去重和 dry-run；未提供导入文件时不会执行实际导入。

## 启动

```bash
cp .env.example .env
npm install
npm test
npm run prisma:validate
npm run dev
```

## 原则

- 不虚构成果和数据
- 不把计划写成已完成
- 人工修改优先
- 素材默认私有
- V1 只导出发布包，不自动发布
