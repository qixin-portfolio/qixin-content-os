# Current Task

Phase 4 complete: Voice Calibration & Editorial Workbench 个人声音校准与人工编辑工作台。

## Completed

- 新增 `EditorialDraft`、`DraftRevision`、`VoiceSample`、`StyleReview` 和对应 enum/relation。
- 原始 `MasterContent`、`EventCard`、`SourceItem` 在编辑流程中保持只读；所有编辑进入 `DraftRevision`。
- `src/lib/editorial/style-reviewer.ts` 使用 deterministic rules 检测模板开头、课程广告腔、过度总结、虚假确定性、情绪化标点、Emoji 和 VoiceProfile 禁用词。
- `src/lib/editorial/rewrite-suggester.ts` 只输出可选建议，允许 Hook 和 CTA 为空，不自动覆盖内容。
- `src/lib/editorial/revision-service.ts` 支持初始草稿、人工 revision、建议 revision、重新 StyleReview、批准、拒绝和批准稿 VoiceSample 沉淀。
- `overallScore < 70` 默认不能批准；override 必须填写原因并写入批准 revision 的 changeSummary。
- `/editorial`、`/editorial/[draftId]` 提供事实只读区、当前稿、建议、版本历史、批准和拒绝入口。
- `/voice/samples` 和相关 API 支持手动添加、查看、评分和启停本人文案样本。
- seed 从透明工地 MasterContent 创建四个平台 EditorialDraft，不把 AI 草稿自动变成 VoiceSample。

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

结果：最终门禁结果记录在 `docs/releases/v0.4.0-phase4.md`。透明工地干净临时数据库验收创建四个平台草稿；朋友圈从初始 Revision 1 经采用建议生成 Revision 2，StyleReview 从 78 提升到 81，状态保持 `editing`，没有自动批准，VoiceSample 数量为 0。

当前只有规则和空样本库，不能声称已经学会齐鑫语气。人工批准真实文案后，才允许沉淀 VoiceSample。

本机 Prisma 7.8 的 `migrate dev`/`migrate deploy` 在 schema engine 阶段仍返回空错误；Phase 4 migration SQL 已用 `db execute` 在干净临时 SQLite 验证，不能将标准 migration deploy 写成通过。

当前不进入 Phase 5，等待用户确认。
