# Current Task

Phase 5.1 complete: Approval Idempotency & Data Integrity Guard 批准幂等与数据完整性保护。

## Completed

- 批准操作以“被批准的源 DraftRevision ID”为幂等单位。
- `DraftRevision.approvedSourceRevisionId` 唯一标识该源 Revision 产生的 `human_approval` Revision。
- `VoiceSample.sourceRevisionId` 唯一标识该源 Revision 产生的 `approved_draft` VoiceSample。
- StyleReview、批准 Revision、EditorialDraft 状态和 approvedAt、VoiceSample 在单个 Prisma 事务中写入；失败整体回滚。
- 服务层对同一 EditorialDraft 的并发批准串行化；数据库唯一索引阻止跨调用重复产物。
- 重复批准返回第一次批准的 Revision 和 VoiceSample ID，并标记 `idempotent: true`；API 返回 `200`，首次批准返回 `201`。
- 批准后新增 `human_edit` Revision 会回到 `editing`；新源 Revision 可以再次独立批准。
- 增量 migration 已在当前 SQLite 和干净临时 SQLite 验证。当前真实批准记录已回填源 Revision 关联，没有重建或删除数据。

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

结果：16 个测试文件、53 个测试通过，其余门禁全部通过。当前数据库迁移和 seed 前后均为 7 条 VoiceSample；正文、标题、评分和时间等不可变字段摘要哈希一致。没有再次调用真实批准稿。

详细结果：`docs/releases/v0.5.1-approval-idempotency.md`。

当前不进入自动发布，不修改现有 7 条 VoiceSample，等待用户确认；本 commit 不自行 push。
