# 知识蒸馏与 Agent Skills 接入

## 定位

本目录记录齐鑫的长期方法论资产生产流程。业务代码仍由 Content OS 管理；可复用 Agent 工作法放在 `agent-skills/`；每次资料蒸馏的审计产物放在本地 `knowledge-packs/`。

## 接入结构

```text
qixin-content-os/
├── agent-skills/
│   └── qixin-knowledge-distiller/
├── docs/knowledge-distillation/
├── scripts/install-agent-skills.sh
└── knowledge-packs/                 # 本地生成，默认不保存原始资料
```

安装脚本还会从固定提交安装 Loop Engineering 的 8 个现成 Skill，作为是否自动化、目标验证、Maker–Checker 和 Loop 架构的基础判断层。

## 为什么放在 Content OS

- 它已经是本地优先、证据驱动的个人内容与知识入口。
- 新增区域与现有 Next.js、Prisma 和发布流程完全解耦。
- 不需要改 GEO Monitor upstream，也不会把方法论塞进某个单一业务仓库。
- 后续 Content OS 可以消费已批准的 Skill 产物，但本阶段不改业务逻辑。

## 安装

先检查操作：

```bash
bash scripts/install-agent-skills.sh --dry-run
```

同时安装到 Hermes 和 Codex：

```bash
bash scripts/install-agent-skills.sh
```

只安装到一个宿主：

```bash
bash scripts/install-agent-skills.sh --hermes-only
bash scripts/install-agent-skills.sh --codex-only
```

默认目标：

- Hermes：`~/.hermes/skills/qixin/`
- Codex：`${CODEX_HOME:-~/.codex}/skills/`

脚本不会覆盖已存在的 Skill；明确需要更新时使用 `--force`。

## 验证

Hermes：

```bash
hermes skills list | grep -E 'qixin-knowledge-distiller|loop-worthiness-test|maker-checker'
hermes chat -q '/qixin-knowledge-distiller 帮我判断这份 GEO 白皮书是否值得做成 skill 包'
```

Codex：重新启动会话后，要求它显式使用 `qixin-knowledge-distiller`，并检查是否读取对应 `SKILL.md`。

## 首个试点

首个试点固定为“GEO 红皮书 + GEO 白皮书资料集”。试点只建立目录和执行规范，不将原始 DOCX/PDF 提交到公开仓库。详见：

`pilots/geo-red-white-paper/PILOT_MANIFEST.md`

## 阶段边界

本次接入只完成：

- Skill 源文件落库。
- Loop Engineering Skill 的可重复安装。
- Hermes/Codex 双宿主安装脚本。
- GEO 红白皮书试点清单和验收规则。

本次不做：

- 不修改 Content OS 业务功能。
- 不自动读取私人资料。
- 不自动公开蒸馏结果。
- 不把未测试 Skill 放入生产工作流。
- 不设置或推送 GEO Monitor upstream。
