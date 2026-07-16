# Current Task | Phase 5.3.4 Fact Enrichment Before Drafting

Phase 5.3.4 has added a local fact-enrichment step and strict per-draft source-quote validation. It is ready for Qixin's real-use review, not for Phase 6B, auto-publishing, or a main merge.

## Current Result

- Three input-specific questions are optional and local-only; sparse mode explicitly produces shorter drafts.
- Each rejected draft type may receive exactly one minimal repair request. Passing candidates remain unchanged; unresolved candidates are hidden instead of filled with fallback text.
- Real Ark calls were reachable with `doubao-seed-character-260628` and no fallback. A sparse passed; B sparse stayed grounded but structurally similar; A enriched and C sparse/enriched were correctly rejected because the model did not supply literal source quotes.
- B enriched remains `pending_user_details`; no synthetic location, scene, or feeling was used.
- Local-session compatibility now migrates pre-enrichment sessions rather than discarding their manual editor content. One already-loaded legacy browser session reached the prior loss path before this repair and is documented as an incident, not a passing result.

## Boundaries

- No database, VoiceSample, approved draft, publication package, or publishing state changed.
- Do not relax source quote validation, add a fallback, alter prompts, push, merge main, or enter Phase 6B without a new instruction.

## Previous Phase 5.3.3 Notes

Phase 5.3.3 最小架构与 mock 验证已完成；真实 Ark topics 仍超过 60 秒并失败。本地提交后不 push、不合并 main、不进入 Phase 6B。

## Latency Isolation

- 旧完整 topics 请求审计：system 63 字、user 424 字、总计 487 字，启发式约 217 tokens；VoiceSample/声音特征 0，JSON Schema 0；`json_object`、max_tokens 1000、stream=false，无 temperature/top_p/thinking/reasoning；原始输入只出现 1 次。
- A 极小 JSON：HTTP 200，TTFB 1.965 秒，总耗时 1.966 秒，JSON 有效。
- B 仅 3 个 topics、无 VoiceSample、无 ContentBrief：60.005 秒无 HTTP 响应，严格 timeout。
- 按规则停止，C 精简声音摘要与 D 旧完整 Envelope 均未调用。
- 结论：基础 `json_object` 可用，VoiceSample 不是 B 超时原因；当前模型或调用方式不适合 60 秒内的交互式三个选题生成。

## Minimal Architecture

- 正式链路改为：本地 GroundingContext -> Ark 三选题 -> Ark 三稿 -> 本地安全检查。
- GroundingContext 只保留 rawInput、sourceMode、platform、用户原话、外部观点标记、禁止声明和缺失信息；不推断情绪、结果、下一步或场景。
- 删除模型 ContentBrief Schema、Provider 调用、API 响应和浏览器 localStorage 字段。deterministic fallback 内部仍可用旧本地拆句器，但不进入 Ark 请求。
- topics 只调用 `createTopics` 一次，模型输出仅含正好 3 条 topics；服务端补 generation metadata 和 lightweightWarnings。
- drafts 初次只调用 `createDrafts` 一次并同时返回三稿；相似或事实风险只标记 insufficient，不自动发第二次模型请求。
- Topics/Drafts Prompt 预算为 4,000/6,000 字；声音摘要先限制 600 字，再裁剪非必要风格；原始输入和事实保护规则不裁剪。超预算由 metadata 记录。
- 当前 7 条样本中选取 4 条高质量样本做本地聚合，传给 Provider 的声音摘要 136 字，不含标题、正文或 ID。
- 简化后 mock 请求：topics 44+374=418 字（约 269 tokens），drafts 65+623=688 字（约 387 tokens）；原始输入各出现 1 次，均未超预算。
- Provider timeout 从 120 秒降为 60 秒，Route 上限从 150 秒降为 75 秒；不增加等待时间。
- 删除通用自动 fallback 辅助函数。timeout、rate_limited、authentication_failed、schema_validation_failed、provider_error 均直接返回；只有用户点击“使用本地演示生成”才直接选择 deterministic provider。

## Real Validation

- 简化后 `/api/create/topics`：HTTP 504，60.249 秒，classification=timeout，fallback=false，topics=0。
- 按顺序验收规则，`/api/create/drafts` 未调用。
- 没有真实选题或草稿，不能声称三稿质量、事实检查或 90 秒完整流程已通过。
- 按任务规则停止继续调 Prompt；不增加 timeout。

## Boundaries

- 未修改 Prisma schema、migration、数据库、VoiceSample、已批准稿或发布包。
- 未把 API Key、Prompt、VoiceSample 或完整失败响应写入 Git。
- 未自动发布、未导入 X 收藏、未进入 Phase 6B。
- 本提交只表示最小架构和错误边界完成，不表示 Ark 真实生成可用。

## Verification

- `npm test`：33 个测试文件、153 项测试通过。
- Prisma validate/generate、lint、TypeScript、Next.js build 全部通过。
- 真实数据库数量、SHA-256、mtime 和大小与任务前基线一致。
