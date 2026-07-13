# GEO 红白皮书 Skill Pack 试点

## 目标

把 GEO 红皮书与 GEO 白皮书从“读过和总结过的资料”变成一组可被 Hermes/Codex 调用的判断与执行 Skill，服务于：

- GEO Monitor 产品设计和边界判断。
- 本地实体老板 GEO 诊断。
- GEO 服务方案、销售沟通与交付审计。
- GEO 内容选题和证据检查。
- 作弊、伦理和合规风险识别。

## 来源

原始文件保持本地私有，不提交到公开仓库。执行时在本地 `SOURCE_MANIFEST.md` 登记实际路径、版本和 SHA-256。

预期来源名称：

1. 《GEO白皮书：AI搜索时代的品牌增长新范式》
2. 《GEO红皮书：生成式引擎优化的伦理边界、作弊风险与治理手册》

## 建议候选 Skill

以下只是候选，不代表已经通过蒸馏和测试：

1. `geo-opportunity-assessment` — 判断一个品牌或行业是否值得投入 GEO。
2. `geo-visibility-audit` — 设计可追溯的 AI 可见度诊断。
3. `geo-content-engineering-plan` — 从问题集和证据缺口生成内容工程计划。
4. `geo-source-authority-strategy` — 判断应补官网、第三方平台还是用户证据。
5. `local-business-geo-playbook` — 将 GEO 原则约束到县城实体商家场景。
6. `geo-measurement-boundaries` — 区分可测指标、代理指标和无法证明的结果。
7. `geo-ethics-risk-check` — 识别操纵、虚假证据、刷量和误导性优化。
8. `geo-client-diagnosis` — 把监测结果转成客户能理解的优先级建议。

## 试点完成标准

- 两份来源均完成 SHA-256 与版本登记。
- `OVERVIEW.md` 通过人工确认。
- 候选经过 V1–V4 验证，最终保留 3–8 个 Skill。
- 每个 Skill 有来源定位、执行步骤、停止条件和边界。
- 每个 Skill 至少 6 条测试，全部反向诱饵通过，总通过率不低于 80%。
- 至少使用 3 个真实问题做集成验收：
  1. “晟景装饰下一步该补官网吗，还是补第三方平台资料？”
  2. “GEO Monitor 监测到没有自然提及，能否直接证明优化失败？”
  3. “客户要求保证三个月进入 AI 推荐前三，应该如何判断和回应？”
- 人工批准后再安装到 Hermes/Codex。

## 明确不做

- 不把白皮书观点直接写成 GEO Monitor 已验证事实。
- 不承诺排名、推荐概率或固定增长结果。
- 不将来源中的大段原文公开提交。
- 不为凑数量强行生成 8 个 Skill。
- 不在本试点中修改 GEO Monitor 产品代码。
