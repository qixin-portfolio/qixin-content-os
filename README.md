# 齐鑫 Content OS

本地优先、证据驱动的个人内容分发中台。它把真实项目进展整理为事件卡、母内容和朋友圈、X、小红书、抖音四个平台版本。

## 当前阶段

Phase 1 已完成：真实事件卡可经过事实检查，生成母内容并适配朋友圈、X、小红书和抖音草稿。

Phase 0 基线包含：

- Next.js + TypeScript + Tailwind CSS
- Prisma + SQLite 数据模型
- Zod 内容事实约束
- Vitest 测试基线
- 设计规格与 V1 实施计划

事件接口：

- `GET /api/events`：获取事件卡列表
- `POST /api/events`：事实检查通过后创建事件卡；缺少证据、结果或个人感受时返回 `400`

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
