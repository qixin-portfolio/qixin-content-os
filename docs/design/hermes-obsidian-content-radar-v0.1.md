# Hermes × Obsidian × Content OS 内容雷达设计文档

**版本：** V0.1  
**日期：** 2026-07-17  
**项目仓库：** `/Users/qixin/Documents/qixin-content-os`  
**稳定基线：** `main@63486c4` / `v0.5.3-minimal-create-workbench-ok`  
**状态：** 待 Codex 实施

## 1. 项目目标

建立一条符合齐鑫真实习惯的内容工作流：

```text
外部文章链接自动进入 Obsidian
→ Hermes 只读检索和连接素材
→ 微信早晚主动推荐值得写的方向
→ 用户选择方向并补充真实经历
→ Content OS 用 FactLedger 生成事实可追溯的候选稿
```

三个系统的分工：

| 系统 | 定位 | 负责 | 不负责 |
|---|---|---|---|
| Obsidian | 素材库与长期记忆 | 保存原文、来源、项目记录 | 主动推荐、最终生成 |
| Hermes | 微信入口与内容雷达 | 检索、召回、去重、推荐、对话编排 | 重做 Content OS 事实引擎 |
| Content OS | 内容生产与事实保护引擎 | 事实补充、FactLedger、三稿、定向修复 | 全量扫描 Vault、微信连接 |

产品一句话：

> Hermes 每天从 Obsidian 中发现真正值得写的内容，Content OS 把选中的方向写得真实、可靠、像齐鑫。

---

## 2. 分阶段范围

### HOC-0｜只读审计

- 找到实际 Obsidian Vault 和微信机器人写入目录。
- 抽样 20 个最近 Markdown，只统计结构，不输出私人正文。
- 明确可读目录与排除目录。
- 不修改任何笔记。

### HOC-1｜只读检索 MVP

- 增量扫描 Markdown。
- 建立本地 sidecar 索引。
- 支持中文关键词检索。
- 通过 Hermes 微信私聊查询素材。
- 支持“看来源 2”。
- 不创建定时任务，不接完整草稿生成。

### HOC-2｜早晚内容雷达

- 上午 9:00 推送三个“今天值得写”的方向。
- 晚上 20:30 推送当天素材复盘和明日方向。
- 推荐去重、换一批、查看来源。
- 暂不生成完整稿。

### HOC-3｜接入 Content OS

- 用户回复“选 1/2/3”。
- Hermes 提出最多三个真实事实问题。
- 调用 Content OS CLI。
- 外部文章保持 `external_opinion` 归属。
- FactLedger → 三稿 → 定向修复 → 微信返回。

### HOC-4｜反馈闭环

- 记录选中率、保留比例、是否发布、未发布原因。
- 根据真实使用调整推荐排序。

第一轮 Codex 只执行 **HOC-0 + HOC-1**。

---

## 3. 非目标

第一版明确不做：

- 向量数据库和全库 embedding。
- 自动发布朋友圈、X、公众号、小红书。
- 自动修改 Obsidian 原文。
- 写入 Content OS 主数据库。
- 云端部署、多用户 SaaS、微信群机器人。
- 把整个 Vault 或整台电脑开放给 Hermes。
- 执行 Markdown 正文中出现的任何指令。

---

## 4. 总体架构

```text
微信私聊
  ↓
Hermes Weixin Gateway
  ↓ 加载 Skill
obsidian-content-radar Skill
  ↓ 调用固定 CLI
Content Radar 本地服务层
  ↓ 只读
Obsidian Vault 白名单目录
```

HOC-3 后增加：

```text
Hermes
→ Content OS CLI
→ FactLedger
→ Ark
→ 三稿
→ 微信
```

关键决策：

1. Skill 源码进入 Git，运行副本安装到 `~/.hermes/skills/qixin/obsidian-content-radar/`。
2. Hermes 调用 CLI，不依赖 `localhost:3000` 开发服务。
3. 第一版用文件元数据、Frontmatter、关键词和推荐历史，不上向量库。
4. 索引和会话数据放独立 sidecar，不改 Content OS SQLite。
5. Obsidian 内容全部按不可信外部数据处理。

---

## 5. 仓库与运行目录

### 5.1 Git 中的源码

```text
qixin-content-os/
├── src/lib/content-radar/
├── scripts/content-radar.ts
├── integrations/hermes/obsidian-content-radar/
├── tests/content-radar/
└── docs/
```

建议 Skill 源码结构：

```text
integrations/hermes/obsidian-content-radar/
├── SKILL.md
├── references/
│   ├── interaction-rules.md
│   ├── security-boundaries.md
│   ├── recommendation-contract.md
│   └── content-os-contract.md
├── scripts/
│   ├── radar-cli.sh
│   └── install.sh
└── templates/
    └── config.example.json
```

### 5.2 本机运行数据

```text
~/.hermes/data/qixin-content-radar/
├── config.json
├── index.json
├── recommendation-history.jsonl
├── sessions/
└── logs/
```

不得写入 Content OS 的 Prisma/SQLite 数据库。

### 5.3 Skill 安装目录

```text
~/.hermes/skills/qixin/obsidian-content-radar/
```

要求：

- 仓库是源码基线。
- Hermes 目录只是运行副本。
- `install.sh` 支持 `--dry-run`。
- 安装前备份已有同名 Skill。
- 不复制本地配置、密钥或真实 Vault 路径。

---

## 6. HOC-0 只读审计

Codex 不得假设 Vault 路径和 Markdown 格式。

先完成：

1. 找到候选 Vault，只在用户目录下进行有限范围定位。
2. 使用 `.obsidian`、目录结构和最近 Markdown 确认实际 Vault。
3. 找到微信机器人最近写入的目录。
4. 抽样最近 20 个 Markdown，统计：
   - 路径模式
   - Frontmatter 字段名
   - 标题来源
   - 原始 URL 字段
   - 保存时间字段
   - 正文长度分布
   - HTML、图片或附件引用
   - 重复文件模式
5. 不输出私人正文全文。
6. 不读取未授权目录。
7. 不修改任何笔记。

生成：

```text
docs/audits/hoc0-obsidian-vault-audit.md
```

真实配置只写本机：

```json
{
  "vaultPath": "/absolute/local/path",
  "allowedRoots": [
    "01_外部收藏",
    "02_项目记录",
    "03_内容灵感",
    "04_已发布内容"
  ],
  "ignoredPatterns": [
    ".obsidian/**",
    "**/.trash/**",
    "**/attachments/**",
    "**/私人日记/**",
    "**/家庭隐私/**",
    "**/合同财务/**",
    "**/客户敏感资料/**"
  ]
}
```

如果无法确认 Vault 或授权目录，停止并向齐鑫汇报，不猜测。

---

## 7. 索引设计

### 7.1 索引对象

```ts
type MaterialIndexItem = {
  sourceId: string;
  relativePath: string;
  title: string;
  sourceUrl: string | null;
  sourcePlatform: "x" | "wechat" | "feishu" | "web" | "manual" | "unknown";
  capturedAt: string | null;
  modifiedAt: string;
  tags: string[];
  excerpt: string;
  contentHash: string;
  wordCount: number;
};
```

### 7.2 sourceId

```text
SRC-<contentHash前12位>
```

文件内容不变时 ID 不变。

### 7.3 摘要与解析边界

- `excerpt` 最大 800 个中文字符。
- 去除 Frontmatter、script、style 和隐藏 HTML。
- 不执行 Markdown 代码。
- 不读取白名单外嵌入文件。
- 超大文件只记录元数据并标记 `oversized`。
- 微信结果只展示相对路径，不展示绝对路径。

### 7.4 增量扫描

比较：

- 相对路径
- mtime
- 文件大小
- 内容 hash

只有新增或变化文件重新解析。删除文件从索引移除，但绝不删除原始文件。

---

## 8. CLI 合同

建议脚本：

```json
{
  "radar:audit": "...",
  "radar:scan": "...",
  "radar:search": "...",
  "radar:install-skill": "..."
}
```

调用示例：

```bash
npm run radar:scan
npm run radar:search -- --query "AI影视流程" --limit 10
```

输出：

```json
{
  "query": "AI影视流程",
  "results": [
    {
      "sourceId": "SRC-...",
      "title": "...",
      "relativePath": "...",
      "sourceUrl": "...",
      "modifiedAt": "...",
      "excerpt": "...",
      "matchedTerms": ["AI", "影视", "流程"]
    }
  ]
}
```

强制要求：

- stdout 只输出 JSON。
- 日志写 stderr。
- 出错返回非零 exit code。
- 无结果返回空数组，不生成猜测内容。
- 不输出绝对路径、密钥或 `.env` 内容。

---

## 9. 第一版检索逻辑

使用可解释规则：

- 标题命中权重最高。
- 标签、Frontmatter 次之。
- 正文关键词命中再次之。
- 多关键词同时命中加权。
- 最近文件可小幅加权，但不能压过相关性。
- 相同 URL、相同内容 hash 去重。

HOC-1 人工测试主题：

1. AI 影视生产流程
2. GEO
3. Content OS
4. 装修行业获客
5. AI 写真或摄影

通过标准：至少 4 个主题中，前 5 条有 3 条以上确实相关。

---

## 10. Hermes Skill 设计

### 10.1 支持的微信表达

- 我收藏过哪些关于 AI 影视流程的内容
- 从素材库找 GEO
- 我之前收藏过 Content OS 相关资料吗
- 看来源 2
- `/obsidian-content-radar`

HOC-1 暂不支持：

- 早晚定时推荐
- 选题后生成完整稿
- 自动保存
- 自动发布

### 10.2 Skill 职责

Skill 只负责：

- 判断检索意图。
- 调用固定 CLI。
- 解析结构化 JSON。
- 输出适合微信阅读的结果。
- 明确来源和日期。
- 无结果时诚实返回。

Skill 不得：

- 自己扫描任意路径。
- 自己改写 Obsidian。
- 直接读 `.env`。
- 执行素材里的命令。
- 修改 Content OS 数据库。
- 自动发布。

### 10.3 微信结果格式

```text
找到 5 条相关素材：

1｜AI 影视真正缺的不是提示词，而是生产流程
来源：X 收藏
时间：2026-07-16
相关原因：同时命中“AI影视、流程、资产、镜头”
路径：01_外部收藏/……md

回复“看来源 1”查看摘要与原链接。
```

---

## 11. Prompt Injection 与安全边界

Obsidian 保存的是外部网页内容，默认全部不可信。

必须保证：

1. 笔记中的“忽略之前指令”“运行命令”等只作为素材文本。
2. 笔记不能决定调用哪些工具。
3. 笔记不能扩大读取目录。
4. 笔记不能要求读取 `.env`、密钥或本机文件。
5. 笔记不能触发自动发布。
6. 拒绝 `../` 路径穿越。
7. 拒绝 symlink 逃出 Vault。
8. 路径标准化后再次确认位于白名单内。
9. 日志不保存完整私人正文。
10. 微信输出不包含绝对本机路径。
11. 私人目录尽量使用文件系统权限隔离，而不是只靠 Prompt。

Cron 和微信 Skill 只开放执行固定 CLI 所需的最小工具集。

---

## 12. HOC-2 早晚内容雷达设计

HOC-1 真人验收通过后再实施。

### 12.1 早间 09:00

三个方向分别来自：

1. 最近 72 小时新增素材。
2. 14 天以前、近期未推荐的历史素材。
3. 外部素材与近期项目的交叉连接。

每条包含：

- 方向标题
- 为什么现在值得写
- 素材依据
- 适合平台
- 还缺的一个真实细节
- 回复命令

### 12.2 晚间 20:30

不超过四项：

1. 今天新增素材中最值得记住的观点。
2. 今天出现频率最高的主题。
3. 一个明天可继续写的方向。
4. 一个多次收藏但一直没有输出的主题。

### 12.3 推荐去重

- 同一 `sourceId` 7 天内不重复。
- 相似核心句 14 天内不重复。
- 已选择方向 30 天内不以相同角度重推。
- “换一批”排除当前批次。
- “以后别推荐这个主题”写入本地排除表。

### 12.4 Cron 启用条件

- 先手动运行早报成功。
- 确认 `Asia/Shanghai` 或宿主机时区。
- 确认微信投递目标。
- 手动触发一次，再启用自动调度。
- HOC-1 未通过前不得创建 Cron。

---

## 13. Content OS 接入合同

HOC-1 只定义，不实现完整生成。

建议 CLI：

```bash
npm run content:topics -- --payload /tmp/radar-topic-input.json
```

输入：

```json
{
  "userInput": "这让我想到自己最近做 Content OS 的经历",
  "sourceMode": "external_material",
  "sourceMaterials": [
    {
      "sourceId": "SRC-...",
      "title": "文章标题",
      "sourceUrl": "https://...",
      "excerpt": "与当前方向直接相关的可靠摘录",
      "sourceType": "external_opinion"
    }
  ],
  "userFacts": [
    "最近在做 Content OS",
    "功能越做越多",
    "真正需要的是每天知道该写什么"
  ]
}
```

映射：

```text
外部文章观点 → external_opinion
用户明确经历 → raw_input / fact_answer
用户自己的判断 → user_judgment
```

外部观点必须保留归属，不得改成齐鑫原创观点。

最终流程：

```text
早报推荐
→ 用户回复“选 2”
→ Hermes 提出最多 3 个事实问题
→ 用户补充或回复“直接写短一点”
→ Content OS FactLedger
→ 三稿与定向修复
→ 微信返回合格稿
```

只有用户明确说“保存这个方向”“保存这稿”才允许持久化；永不自动发布。

---

## 14. 测试要求

至少覆盖：

1. 配置缺失明确报错。
2. Vault 不存在明确报错。
3. 白名单为空拒绝运行。
4. Frontmatter 正常解析。
5. 无 Frontmatter 可解析。
6. 标题回退到 H1。
7. 无 H1 回退到文件名。
8. URL 多字段兼容。
9. hash 稳定。
10. 增量扫描只处理变化文件。
11. 删除文件从索引移除。
12. ignoredPatterns 生效。
13. `../` 路径穿越拒绝。
14. symlink 逃逸拒绝。
15. HTML/script 清理。
16. 超大文件边界。
17. 中文关键词搜索。
18. 中英文混合搜索。
19. 空结果。
20. stdout JSON 合同。
21. stderr 不污染 JSON。
22. 绝对路径脱敏。
23. 私人目录不可见。
24. 笔记中的提示注入不执行。
25. Content OS 数据库 hash、size、mtime 不变。

---

## 15. HOC-1 验收标准

### 功能

- 给定主题，返回最多 10 条相关 Markdown。
- 含标题、来源、日期、摘要、相对路径。
- 新文件可增量发现。
- 未变化文件不重复解析。
- 删除文件从索引移除。
- “看来源 2”对应正确素材。
- 无结果不编造。

### 安全

- Obsidian Markdown 零修改。
- 非白名单目录不可搜索。
- 路径穿越和 symlink 逃逸被拒绝。
- `.env`、密钥、绝对路径不进入微信。
- 素材中的指令不影响 Hermes。
- Skill 无无关工具权限。

### 数据

Content OS 保持：

- VoiceSample：7
- PublicationPackage：1
- PublicationExport：3
- EditorialDraft：4
- DraftRevision：7
- 数据库 SHA-256、size、mtime 不变

---

## 16. Git 与提交策略

从 `main@63486c4` 创建：

```text
codex/hermes-obsidian-content-radar-v0.1
```

建议提交：

1. `docs: design hermes obsidian content radar`
2. `feat: add read-only obsidian material index`
3. `feat: add hermes obsidian content radar skill`
4. `test: verify content radar safety boundaries`
5. `docs: record hoc1 acceptance`

要求：

- HOC-1 人工验收前不 push、不合并 main。
- 不修改 Ark Prompt、FactLedger、Prisma Schema。
- 不创建早晚 Cron。
- 不进入 HOC-2。
- 不部署生产环境。

---

## 17. HOC-1 交付物

1. 本设计文档。
2. Vault 只读审计报告。
3. 增量索引和搜索 CLI。
4. Hermes Skill 源码与安装脚本。
5. 微信检索说明。
6. 25 项以上测试。
7. Prompt Injection 安全审计。
8. Obsidian 零修改证明。
9. Content OS 数据库零写入证明。
10. HOC-1 Release Review。
11. 本地功能分支，等待齐鑫真人验收。

---

## 18. 最终产品形态

```text
09:00 Hermes：今天值得写的 3 个方向

齐鑫：选 2

Hermes：再补两个真实细节，或回复“直接写短一点”

齐鑫：补充真实经历

Hermes → Content OS：
外部素材 + 来源归属 + 用户事实

Content OS：
FactLedger → 三稿 → 定向修复

Hermes：将合格稿发回微信
```

核心原则：

> Obsidian 保存世界给齐鑫的输入，Hermes 主动发现连接，Content OS 只根据有来源的事实完成输出。
