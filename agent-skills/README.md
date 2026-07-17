# Agent Skills

这里保存齐鑫自有或经过明确适配的 Agent Skills 源文件。目录中的 Skill 不会自动进入生产环境；必须通过测试并由 `scripts/install-agent-skills.sh` 安装到 Hermes/Codex。

## 当前 Skill

- `qixin-knowledge-distiller`：将高价值长内容蒸馏为少量可执行、可追溯、可测试的长期方法论资产。

## 外部 Skill

Loop Engineering Skill Pack 不直接复制进本仓库。安装脚本从固定提交 `f959a779480fcb56808c3c0d7647c1e664f5f6f9` 获取 8 个 Skill，降低上游漂移和供应链风险。

## 规则

- 原始客户资料、书籍、白皮书、音视频和转写稿不进入公开仓库。
- 外部 Skill 必须固定版本并保留来源与许可证。
- Skill 修改后必须重新执行正向、反向、边界和跨 Skill 混淆测试。
