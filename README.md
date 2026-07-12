# 齐鑫 Content OS

本地优先、证据驱动的个人内容分发中台。它把真实项目进展整理为事件卡、母内容和朋友圈、X、小红书、抖音四个平台版本。

## 当前阶段

Phase 3 已完成：Content OS 已在可追溯 EventCard 上增加内容机会评分、内容角度、VoiceProfile 和人工确认后的 MasterContent mock 草稿生成。

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

初始化本地项目和真实透明工地资料：

```bash
npm run prisma:seed
```

seed 默认读取 `/Users/qixin/Documents/我的搞钱方向`，也可以通过 `CONTENT_OS_MATERIAL_ROOT` 指定资料根目录。资料缺失时 seed 会失败，不会生成替代内容。

内容生成使用 mock provider，所有平台版本仍需人工审核，不做自动发布。

Phase 3 的评分只用于排序和生成建议：`publish_now`、`combine_later`、`archive_only`。低分事件不会被删除；生成的 MasterContent 会保存 SourceItem ID 引用。

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
