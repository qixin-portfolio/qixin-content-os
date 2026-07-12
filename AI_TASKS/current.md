# Current Task

Phase 3 complete: Content Intelligence Layer 内容智能层。

## Completed

- 新增 `ContentScore`，按新鲜度、个人性、行业性、画面性、业务性评分，总分 0-100。
- 新增 `ContentAngle`，根据评分生成事实型内容角度；低分事件最多保留两个角度，不删除事件。
- 新增 `VoiceProfile`，保存平台语气、偏好词、禁用词和写作规则。
- `MasterContent` 增加 `factReferencesJson`，生成结果保留 SourceItem ID 引用。
- `src/lib/content/content-scorer.ts` 提供确定性评分和数据库评分转换。
- `src/lib/content/angle-generator.ts` 提供确定性角度生成。
- `src/lib/ai/content-generator.ts` 增加 mock 智能母内容生成；`archive_only` 事件禁止生成。
- `/opportunities` 和 `/opportunities/[eventId]` 提供评分、证据、角度、VoiceProfile 选择和人工确认后的生成入口。
- `/api/opportunities`、`/api/opportunities/[eventId]` 和生成接口已建立；已有 MasterContent 返回 `409`，不覆盖已有内容。
- seed 已加入四个默认 VoiceProfile，并为透明工地真实资料生成评分、角度和母内容草稿。

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

结果：11 个测试文件、28 个测试通过；Prisma validate、generate、lint、TypeScript 检查和 build 均通过。seed 可重复执行，透明工地验收为 `74/100`、`combine_later`、5 个角度和 1 个 MasterContent draft。

API smoke check：机会列表和事件详情返回 `200`；已有 MasterContent 时生成接口返回 `409`，确认未覆盖。

本机 Prisma 7.8 的 `migrate dev`/`migrate deploy` 在 schema engine 阶段返回空错误；Phase 3 migration SQL 由 `migrate diff` 生成，并用 `db execute` 验证可执行。该工具限制不标记为迁移命令通过。

## Current Boundary

- 使用 deterministic mock provider，未接入 OpenAI、Claude、DeepSeek 或豆包。
- 未接入向量数据库、RAG、多 Agent、多模型路由。
- 未生成或自动发布四平台版本；所有内容仍需人工审核。
- 当前只提供评分、角度和 MasterContent draft，不代表产品上线、商业成交或平台发布。

当前不进入 Phase 4，等待用户确认。
