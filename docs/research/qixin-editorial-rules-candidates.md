# 齐鑫编辑规则候选

本表只记录外部写作参考转译出的候选规则。本次全部为 `proposed`，不修改 VoiceProfile、StyleReview、rewrite-suggester 或数据库。候选规则不是 VoiceSample，也不能替代齐鑫人工判断。

| ruleId | 规则 | 检测对象 | 建议动作 | 来源方法 | 状态 |
|---|---|---|---|---|---|
| `opening.concrete_event` | 开头优先进入具体事件，不写时代背景 | Hook、首段 | 若首段只有宏大背景，提示补充真实事件或留空 | 从具体事件进入 | `proposed` |
| `opening.personal_situation` | 优先说“我遇到了什么”，不先输出大道理 | Hook、正文开头 | 检查是否存在本人真实处境；没有证据时不自动补“我” | 建立人物处境 | `proposed` |
| `evidence.before_abstraction` | 抽象判断前至少有一个事实或细节 | 正文段落 | 提示人工补证据，不自动生成细节 | 事实和行为先于理由 | `proposed` |
| `evidence.no_fabricated_conflict` | 冲突必须来自真实限制，不能为效果编造 | EventCard、MasterContent | 将新增对白、争执、反馈和反转标为人工核验项 | 真实冲突 | `proposed` |
| `status.explicit_uncertainty` | 可以承认不知道、没做完和判断变化 | result、reflection、CTA | 保留限制条件，禁止改写为完成或确定成果 | 允许不确定和未完成 | `proposed` |
| `language.delete_redundancy` | 删除不影响意思的总结和解释句 | 标题、正文、CTA | 提示删减，保留事实限定和证据边界 | 压缩表达 | `proposed` |
| `language.concrete_nouns` | 抽象名词后应有具体材料或动作 | 正文 | 标记“资料、能力、价值、闭环”等空泛表达供人工复核 | 具体细节 | `proposed` |
| `emotion.real_only` | 个人感受必须来自本人确认 | reflection、第一人称句 | 没有人工输入时不生成情绪词 | 真实情绪 | `proposed` |
| `voice.no_external_imitation` | 不模仿李诞的标志性句式、口头禅或人设 | 全文、VoiceSample 来源 | 外部资料只能做方法研究，不得进入样本库 | 风格是长期副产品 | `proposed` |
| `cta.optional` | CTA 默认允许为空 | CTA | 无真实下一步时保持为空 | 结尾不强行引导 | `proposed` |
| `ending.no_forced_elevation` | 结尾不强行升华为人生结论 | 最后一段、CTA | 删除无证据的成长、改变和成功结论 | 观点从经历中出现 | `proposed` |
| `humor.fact_preserving` | 幽默不能改变事实 | 标题、Hook、正文 | 事实改变时要求人工重写，不自动采用笑点 | 包袱不应制造事实 | `proposed` |
| `self_deprecation.bounded` | 自嘲只能降低姿态，不能贬低自己或项目 | 全文 | 只做人工判断，不自动添加或删除自嘲 | 自嘲的语境限制 | `proposed` |
| `rhythm.context_then_judgment` | 先让读者理解处境，再推进判断 | 段落顺序 | 给出重排建议，不自动改变事实顺序 | 先同步再引领 | `proposed` |
| `draft.revision_visible` | 修改应保留原稿、修改来源和变更原因 | DraftRevision | 继续使用现有 revision 机制，禁止静默覆盖 | 专业工作和修改过程 | `proposed` |
| `sample.external_reference_block` | 外部作者内容不作为 VoiceSample | 导入脚本、VoiceSample | 拒绝把研究资料或其改写直接导入样本 | 外部参考与本人声音分离 | `proposed` |

## 使用边界

这些规则当前只适合做人工编辑提示、研究清单和未来测试候选。它们不能证明一篇文案“像齐鑫”，不能判断一处自嘲是否成立，也不能替代事实核验和人工批准。
