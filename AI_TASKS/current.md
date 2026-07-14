# Current Task | Phase 5.3.1 Non-Template Content Generation

Phase 5.3.1 implementation 已完成本地代码、mock 测试和 deterministic fallback 浏览器验收；等待齐鑫配置火山方舟参数后进行 Seed 2.1 最小真实调用验收。不推送、不合并 main。

## Completed

- 审计 `7aae10f` 的选题与三稿模板根因，记录固定开头、转折、结尾和 VoiceSample 未实际参与生成的问题。
- 生成改为 ContentBrief -> Topics -> Drafts 两阶段，并在服务层按原始输入再次收紧 ContentBrief。
- 三稿分别使用事情顺序、已有个人判断和 2-4 段克制结构，不强制下一步、CTA 或升华。
- VoiceSample 只读取正文；`approved_draft` 和高评分样本权重更高，内部索引标题不参与。
- 提取样本的开头、观点位置、段落节奏、留白、不确定性、自嘲和情绪结构；Provider 不接收样本原句。
- 检查首句、连续句、段落节奏、结尾、抽象判断、仅长短变化和样本整句复制；只定向重试一次。
- 新增统一 Provider interface 和 `volcengine_ark` 实现。Route 只调用 factory，不初始化客户端。
- Ark 只从服务端读取 `ARK_API_KEY` 和 `ARK_MODEL_ID`，调用官方 Chat API JSON 输出并通过 Zod 校验；模型 ID 不硬编码。
- 未配置或调用失败时降级为 `deterministic_fallback`，页面显示“当前使用本地演示生成，文案可能带有模板感。”
- 五条指定输入已从真实 `/create` 页面完成 fallback 验收，未调用 Ark，未写数据库。

## Verification

- `npm test`：31 个测试文件、125 项通过，包含事实约束、VoiceSample 权重、相似度、Ark mock、fallback 和五条验收输入。
- Prisma validate/generate、lint、TypeScript 和 production build 通过。
- 浏览器五条输入均返回三个选题、三稿、`qualityStatus: passed` 和明确 fallback 提示。
- 真实数据库前后文件 SHA-256、mtime 和大小一致；VoiceSample 7、PublicationPackage 1、PublicationExport 3、EditorialDraft 4、DraftRevision 7。

## Boundaries

- 当前没有 `ARK_API_KEY` / `ARK_MODEL_ID`，未执行 Seed 2.1 真实效果验收。
- 不接 Grok、Qwen、DeepSeek，不使用联网搜索、知识库或豆包助手。
- 不修改 Prisma 模型、VoiceSample、已批准稿、发布包或自动发布链路。
- fallback 文案仍可能机械，只用于本地演示和边界验证，不能声称已学会齐鑫声音。
- 下一步只能等待齐鑫配置真实 Ark 参数，再做最少调用的五条效果验收；不进入 Phase 6B。
