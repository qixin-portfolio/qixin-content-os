# Current Task

Phase 2 complete: Reality Import Layer 真实项目资产导入层。

## Completed

- 新增 `ProjectSource`，并建立 Project → ProjectSource → SourceItem 关系
- EventCard 增加 SourceItem 多来源关联，创建时校验同一 Project
- `GET/POST /api/projects` 与项目列表页
- Markdown import service、导入 API 和导入页面
- 指定 GitHub commit adapter，失败时返回明确错误
- mock EventCard generator，缺少事实字段时返回 validation error
- seed 四个项目、四个透明工地 SourceItem 和一个证据绑定 EventCard
- Prisma migration、SQLite adapter 和 migration diff 校验

## Verification

```bash
npm test
npm run prisma:validate
npm run lint
npm run build
```

结果：8 个测试文件、18 个测试通过；prisma validate、prisma generate、lint、build 和 migration diff 均通过。

本机 Prisma 7.8 的 `migrate dev`/`migrate deploy` 在 schema engine 阶段返回空错误，因此本地数据库使用已审查的 migration SQL 执行并完成 seed；该工具限制未标记为迁移命令通过。

等待用户确认后再进入 Phase 3；当前不自动发布。
