# Current Task | Phase 5.3 Minimal Content Creation Workbench

Phase 5.3 implementation 已完成，等待齐鑫确认，不推送 implementation commit，不合并 main。

## Completed

- `/` 直接进入 `/create`，普通用户无需先经过后台页面。
- `/create` 支持手动输入、最近项目和 X 收藏三个入口；X 收藏未接入时显示真实空状态。
- 最近项目只读查询有 SourceItem 追溯的 EventCard；透明工地从默认列表排除，只保留主动打开的演示入口。
- `POST /api/create/topics` 使用 deterministic 本地规则返回三个朋友圈选题，不写数据库。
- `POST /api/create/drafts` 只读参考朋友圈 VoiceProfile 和 7 条 VoiceSample，返回真实记录版、个人观点版、克制短版，不复制样本原句。
- 单一编辑器、最多三条轻量提示、配图建议和默认折叠的来源安全检查已完成。
- `qixin-content-os:create-session:v1` 保存完整本机创作状态，支持损坏数据安全降级、刷新恢复和确认清空。
- 复制只包含编辑器正文；复制和清空不会创建 Revision、VoiceSample、PublicationPackage、PublicationExport 或 PublishRecord。

## Verification

- `npm test`：25 个测试文件、99 个测试通过。
- `npm run prisma:validate`、`npm exec prisma generate`、`npm run lint`、`npm exec tsc -- --noEmit`、`npm run build` 通过。
- Playwright 桌面和 390px 手机端完成手动输入、三选题、三稿、编辑、刷新恢复、复制、清空和 X 空状态验收；手机端无横向溢出。
- 真实库保持 VoiceSample 7、PublicationPackage 1、PublicationExport 3、EditorialDraft 4、DraftRevision 7；真实包仍为 exported，publishedAt 为空。

## Boundaries

- 没有新增 Prisma 模型或 migration。
- 没有修改现有 7 条 VoiceSample、已批准稿或发布包。
- 没有接入真实 AI Provider、自动发布或 Phase 6B。
- 没有导入 X 收藏资料或 TopicCandidate。
- implementation commit 不自行 push，等待齐鑫人工确认三稿和页面体验。
