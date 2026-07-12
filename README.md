# 齐鑫 Content OS

本地优先、证据驱动的个人内容分发中台。它把真实项目进展整理为事件卡、母内容和朋友圈、X、小红书、抖音四个平台版本。

## 当前阶段

Phase 2 已完成：Content OS 已接入真实项目资料，可建立项目、导入私有 Markdown 素材，并从可追溯 SourceItem 生成 EventCard 草稿。

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

初始化本地项目和真实透明工地资料：

```bash
npm run prisma:seed
```

seed 默认读取 `/Users/qixin/Documents/我的搞钱方向`，也可以通过 `CONTENT_OS_MATERIAL_ROOT` 指定资料根目录。资料缺失时 seed 会失败，不会生成替代内容。

内容生成使用 mock provider，所有平台版本仍需人工审核，不做自动发布。

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
