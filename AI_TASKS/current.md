# Current Task | Phase 5.3.2 Ark Structured Output & Latency Hardening

Phase 5.3.2 工程实现与 mock 验证已完成；严格真实验收未通过，等待齐鑫确认后续模型延迟处理。不推送、不合并 main、不进入 Phase 6B。

## Completed

- 保留 Phase 5.3.1 后的 9 个 timeout 修改：Ark Provider 120 秒、Create Route 150 秒、timeout 明确分类且不 fallback。
- 将 topics 流程从 ContentBrief + TopicCandidates 两次模型调用合并为一次 `TopicGenerationEnvelope`。
- 使用 `json_object` + 安全 JSON 解析 + 严格 Zod；只接受直接 JSON 或单一完整 Markdown JSON 围栏。
- 可空语义字段允许空字符串；数组允许 null/空值和安全的单字符串转单元素数组，不补事实、情绪、结论或下一步。
- 第一次结构失败只允许一次结构修复请求；第二次失败返回 `schema_validation_failed`。
- drafts 一次请求返回 scene_record、thought_progression、restrained_short 三稿；只对质量失败版本定向重试一轮。
- Provider 返回 model、durationMs、repairCount、responseFormat 和 slowResponse 等非敏感元信息。
- 默认禁止自动 fallback；缺少 Ark Key/模型 ID 时返回明确配置错误，只有用户点击“使用本地演示生成”后，Route 才直接使用 deterministic provider。
- 页面显示“本地演示内容可能带有模板感，不代表真实模型效果。”，真实错误不再伪装为成功。
- VoiceSample 只提取高质量样本结构摘要：5 分样本 + 最多两条 4 分样本；不向模型发送标题或完整正文。
- 增加禁用模板短语检查、groundedFacts/unresolvedClaims 事实收紧和 localStorage 输入保留测试。

## Real Validation

- Ark 最小 curl：HTTP 200，首字节 1.773 秒，总耗时 1.777 秒。
- Node Provider 最小文本：HTTP 200，1.577 秒。
- 旧 ContentBrief：113.402 秒后 ZodError；旧请求为 `json_object`、max_tokens 2600、单次 fetch、无 VoiceSample 注入。
- Phase 5.3.2 严格 `brief + topics`：120.399 秒后 timeout，HTTP 504，fallback=false，topics=0。
- 按顺序验收规则已停止，drafts 未调用；不能声称真实 Ark 结构化生成已完成。
- `json_schema` 能力未获可靠实测证据，未添加猜测参数；当前保持 `json_object` + JSON.parse + Zod。

## Boundaries

- 没有修改 Prompt 之外的用户正文、数据库、VoiceSample、已批准稿或发布包。
- 没有把真实响应写入 Git；验收响应只在 `/tmp`。
- 没有自动发布、X 导入或 Phase 6B。
- 当前普通页面对 timeout/schema/auth/model/rate-limit 都不自动 fallback；需要用户主动选择本地演示。
- 本阶段提交只表示结构化协议和错误边界已加固，不表示真实延迟目标已达成。

## Engineering Verification

- `npm test`：32 个测试文件、149 项通过。
- Prisma validate/generate、lint、TypeScript、Next.js build：通过。
- 真实数据库保持 VoiceSample 7、PublicationPackage 1、PublicationExport 3、EditorialDraft 4、DraftRevision 7。
- `prisma/dev.db` SHA-256、mtime、大小保持 `dac5fa9e...df`、`1783936224`、`258048` 字节。
