---
name: qixin-knowledge-distiller
description: 将书籍、白皮书、长视频转写、播客、课程、访谈或资料集蒸馏为少量可执行、可追溯、可测试的 AI Skills。用户提出“把这份资料沉淀成方法论”“做成可复用 skill”“以后让 Hermes/Codex 自动调用”时使用。不适用于普通摘要、读后感、单次问答或没有原始文本的凭记忆整理。
version: 0.1.0
metadata:
  hermes:
    tags: [knowledge-distillation, methodology, qixin, evidence-driven]
    category: qixin
---

# Qixin Knowledge Distiller

将高价值长内容变成齐鑫自己的长期数字资产：不是把资料压缩成一篇总结，而是生成少量、边界清楚、能被 Hermes/Codex 在真实任务中调用的方法论 Skill。

本 Skill 基于 `kangarooking/cangjie-skill` 的 RIA-TV++ 思路做本地化适配。保留“整体理解、并行提取、三重验证、RIA++、关系链接、压力测试”的骨架，并增加齐鑫工作流需要的隐私分级、业务适配门槛、人工批准与双宿主安装规则。

## 使用边界

### 应使用

- GEO 白皮书、红皮书、行业报告需要沉淀为长期判断框架。
- 长视频、课程或播客里包含可重复执行的方法论。
- 已验证的项目经验要变成以后可调用的操作流程。
- 用户明确要求产出 Skill 包，而不只是总结。

### 不应使用

- 只需要几百字摘要、翻译、观点解释或读后感。
- 原始文本不可访问，且只能凭模型记忆补全。
- 内容主要是新闻事实、人物故事或情绪表达，没有稳定方法论。
- 一次性任务，不会复用，也无法建立客观验证标准。
- 涉及未授权客户隐私、密钥、合同原文或禁止进入 Agent 上下文的材料。

## 默认策略

1. **一次只试点一份资料集。** 默认生成 3–8 个 Skill，不追求数量。
2. **本地优先。** 原始 PDF、DOCX、转写稿和客户资料不提交到公开仓库。
3. **证据优先。** 每个方法论必须能回指章节、页码、时间戳或文件段落。
4. **人工两道门。** 整体理解后确认一次；候选 Skill 筛选后确认一次。
5. **先测试再安装。** 未通过诱饵测试和边界测试的 Skill 不进入 Hermes/Codex。
6. **不把计划写成完成。** 未执行、未验证、未部署的内容必须保持计划状态。

## 输入要求

开始前必须获得：

- 可访问的原始文本路径或已提取的纯文本。
- 来源元信息：标题、作者/机构、版本或发布时间。
- 内容类型：书籍、白皮书、视频、播客、课程、访谈或资料集。
- 隐私级别：`public`、`internal`、`confidential`。
- 目标用途：例如产品决策、客户诊断、内容生产、销售、项目审计。
- 目标宿主：Hermes、Codex，或两者。

缺少原始文本时停止蒸馏，不凭记忆生成。

## 输出目录

在当前项目或用户指定的知识资产根目录下创建：

```text
knowledge-packs/<pack-slug>/
├── PIPELINE_STATE.md
├── SOURCE_MANIFEST.md
├── OVERVIEW.md
├── verified.md
├── INDEX.md
├── GLOSSARY.md
├── DIGEST.md
├── candidates/
├── rejected/
└── skills/
    └── <skill-slug>/
        ├── SKILL.md
        ├── test-prompts.json
        └── test-results.md
```

可以使用本 Skill 的 `scripts/bootstrap-pack.sh` 初始化目录。

## 执行流程

### 阶段 0：预检与来源登记

1. 检查原始文件可读取。
2. 记录 SHA-256、文件名、来源、版本和隐私级别。
3. 明确允许引用的长度与是否允许公开分发。
4. 判断是否值得 Skill 化：
   - 会重复使用吗？
   - 能识别触发场景吗？
   - 能定义执行步骤和停止条件吗？
   - 能用测试判断是否误触发吗？
5. 任一核心条件不满足，改做普通摘要或参考笔记。

完成后更新 `PIPELINE_STATE.md`。

### 阶段 1：整体理解

从四个角度整理 `OVERVIEW.md`：

- **结构**：内容的主要问题、章节和论证链。
- **解释**：核心概念、作者主张和因果关系。
- **批判**：证据强弱、时代局限、利益立场和不适用场景。
- **应用**：对齐齐鑫当前项目，哪些判断或流程可以被重复调用。

展示整体骨架，完成第一次人工确认后再继续。

### 阶段 2：五路候选提取

支持并行 Sub-agent；环境不支持时串行执行，产出格式不变。

1. 框架：决策模型、流程、分层结构。
2. 原则：规则、清单、阈值和判停条件。
3. 案例：作者或材料中真实使用方法的证据。
4. 反例：失败模式、误用和风险。
5. 术语：共享概念及其精确定义。

写入 `candidates/`，不得直接把全部候选做成 Skill。

### 阶段 3：四重验证筛选

每个候选必须同时通过：

- **V1 交叉佐证**：至少两处独立证据，或一处强证据加一处真实案例。
- **V2 迁移能力**：能回答材料没有直接给答案的新问题。
- **V3 非常识性**：不是换一种说法的常识。
- **V4 齐鑫适配性**：能支持当前或预期的重复工作，例如 GEO 诊断、SaaS 决策、装修获客、内容运营、摄影/AI 影像交付。

通过项写入 `verified.md`；未通过项写入 `rejected/` 并保留原因。

展示“保留 N 个、淘汰 M 个”的清单，完成第二次人工确认。

### 阶段 4：构造原子 Skill

每个 Skill 只解决一个稳定问题，并使用模板中的六段结构：

- **R — Reference**：短引用或精确来源定位。
- **I — Interpretation**：用自己的话重建方法论。
- **A1 — Past Application**：来源材料中的应用案例。
- **A2 — Future Trigger**：真实触发场景、语言信号、与相邻 Skill 的区别。
- **E — Execution**：执行步骤、完成标准、判停条件。
- **B — Boundary**：不适用场景、失败模式、作者盲点和合规风险。

`description` 必须写清“何时调用、何时不调用、关键触发信号”。

### 阶段 5：建立 Skill 关系

为每个 Skill 标记：

- `depends-on`
- `contrasts-with`
- `composes-with`

生成 `INDEX.md` 和共享 `GLOSSARY.md`。避免多个 Skill 对同一类问题争抢触发。

### 阶段 6：压力测试

每个 Skill 至少包含：

- 3 条 `should_trigger`
- 2 条 `should_not_trigger`
- 1 条 `edge_case`
- 至少 1 条“应该触发兄弟 Skill”的混淆诱饵

硬性通过规则：

- 全部 `should_not_trigger` 必须通过。
- 总通过率不低于 80%。
- 误触发时回到阶段 4 重构，不只修改测试答案。
- 结果写入 `test-results.md`。

### 阶段 7：交付与安装

1. 生成 `DIGEST.md`，供人阅读。
2. 检查原始资料、客户隐私和大段版权文本未进入公开提交。
3. 只有人工批准且测试通过的 Skill 才可安装。
4. Hermes 安装目标：`~/.hermes/skills/qixin/<skill-name>/`。
5. Codex 安装目标：`${CODEX_HOME:-~/.codex}/skills/<skill-name>/`。
6. 安装后开启新会话验证触发、误触发和宿主兼容性。

## 质量红线

- 不得虚构来源、页码、时间戳、案例、数据和验证结果。
- 不得将整本书、整份白皮书或大段受版权保护文本复制进 Skill。
- 不得将 `.env`、Token、客户隐私、未授权图片或内部合同写入产物。
- 不得为了凑数量拆出边界重叠的 Skill。
- 不得跳过人工确认与压力测试直接安装。
- 不得把“建议”“计划”“预期”写成已经验证的事实。

## 相关文件

- 适配说明：`references/cangjie-adaptation.md`
- Skill 模板：`templates/SKILL.md.template`
- 状态模板：`templates/PIPELINE_STATE.md.template`
- 测试模板：`templates/test-prompts.json.template`
- 初始化脚本：`scripts/bootstrap-pack.sh`
