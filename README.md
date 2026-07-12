# 齐鑫 Content OS

本地优先、证据驱动的个人内容分发中台。它把真实项目进展整理为事件卡、母内容和朋友圈、X、小红书、抖音四个平台版本。

## 当前阶段

Phase 0 基线已建立：

- Next.js + TypeScript + Tailwind CSS
- Prisma + SQLite 数据模型
- Zod 内容事实约束
- Vitest 测试基线
- 设计规格与 V1 实施计划

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
