import type { ContentBrief, CreateSourceMode, CreateTopicCandidate } from "./types";

type GenerateTopicInput = {
  sourceMode: CreateSourceMode;
  sourceText: string;
  platform: "wechat_moments";
  brief: ContentBrief;
};

function clip(value: string, length = 24) {
  const clean = value.replace(/[。！？!?]+$/u, "").trim();
  return clean.length > length ? `${clean.slice(0, length)}…` : clean;
}

function gapText(input: GenerateTopicInput) {
  const gaps = input.brief.missingContext;
  if (input.sourceMode === "manual" && input.sourceText.trim().length < 12) {
    return "可以再补一句发生了什么；这部分来自你的临时输入，发布前请确认准确。";
  }
  if (gaps.length > 0) return `${gaps.join("；")}；这部分来自你的临时输入，发布前请确认准确。`;
  return input.sourceMode === "manual"
    ? "这部分来自你的临时输入，发布前请确认准确。"
    : "发布前请确认项目状态仍与现有资料一致。";
}

export function generateFallbackTopics(input: GenerateTopicInput): CreateTopicCandidate[] {
  if (input.sourceMode === "x") throw new Error("X 收藏研究库尚未接入当前版本");
  if (!input.sourceText.trim()) throw new Error("请先写下一句话，或选择一个最近项目");

  const { brief } = input;
  const gap = gapText(input);
  const event = brief.concreteDetails[0] ?? brief.whatHappened;
  const tension = brief.tension ?? brief.unresolvedQuestion ?? brief.personalReaction ?? brief.whatHappened;
  const judgment = brief.personalJudgment ?? brief.personalReaction ?? brief.tension ?? brief.whatHappened;
  const featureContext = /功能/u.test(input.sourceText);
  const complexityContext = /功能越来越多|功能越做越多|越做越复杂|功能复杂/u.test(input.sourceText);
  const externalContext = brief.externalReferences.length > 0;
  const usabilityContext = /Content OS|内容系统|产品/u.test(input.sourceText)
    && /重新打开|会用|愿意使用|使用/u.test(input.sourceText);

  const focus = externalContext
    ? {
        title: "别人的观点，怎么落到自己的经历？",
        whyWorthWriting: "这条区分外部观点和自己的经历，不把别人的判断写成原创结论。",
        recommendedAngle: "先说明观点来自别人，再写它触发的个人经历和判断。",
        difference: "与另外两条相比，这条聚焦外部观点归属和个人经历的边界。",
      }
    : featureContext
      ? {
          title: "会做功能，和会做产品是一回事吗？",
          whyWorthWriting: "这条比较能力扩张和真实使用之间的距离。",
          recommendedAngle: "只讨论功能能力与产品判断的区别，不写成果总结。",
          difference: "与另外两条相比，这条聚焦会做功能和会做产品的区别。",
        }
      : usabilityContext
        ? {
            title: "从重新打开，到愿意使用",
            whyWorthWriting: "这条只写一次真实使用感受的变化，不推导不存在的功能原因。",
            recommendedAngle: "围绕重新打开后的感受展开，停在愿意使用这个判断上。",
            difference: "与另外两条相比，这条聚焦从重新打开到愿意使用的变化。",
          }
        : {
            title: `${clip(brief.concreteDetails.at(-1) ?? tension)}，停在这里`,
            whyWorthWriting: "这条删掉解释，只留下最值得记住的事实和留白。",
            recommendedAngle: "使用最少的信息，不强制下一步或升华。",
            difference: "与另外两条相比，这条只保留最需要说的部分。",
          };

  return [
    {
      key: "record",
      title: `${clip(event)}，具体发生了什么？`,
      whyWorthWriting: "这条保留事情本身，让读者先看到真实变化或现场。",
      recommendedAngle: `围绕“${clip(event, 36)}”展开，不先解释意义。`,
      platform: "朋友圈",
      missingInformation: gap,
      sourceBasis: `来自原始输入中的具体事实：“${clip(event, 42)}”。`,
      difference: complexityContext
        ? "与另外两条相比，这条只追踪产品为什么一步步变复杂。"
        : featureContext
          ? "与另外两条相比，这条只写输入中已经出现的功能和真实状态，不推导成果。"
          : "与另外两条相比，这条只写现场和发生顺序。",
    },
    {
      key: "perspective",
      title: brief.personalJudgment ? clip(brief.personalJudgment, 30) : `${clip(tension)}，矛盾在哪？`,
      whyWorthWriting: "这条聚焦输入里已经出现的落差或个人判断，不额外补结论。",
      recommendedAngle: `用“${clip(tension, 40)}”支撑判断，保留不确定。`,
      platform: "朋友圈",
      missingInformation: gap,
      sourceBasis: `来自原始输入中的判断或落差：“${clip(judgment, 42)}”。`,
      difference: featureContext
        ? "与另外两条相比，这条只讨论真正需要解决的日常问题。"
        : externalContext
          ? "与另外两条相比，这条只写外部观点触发的个人判断。"
          : "与另外两条相比，这条从个人判断推进，不按时间复述。",
    },
    {
      key: "focus",
      title: focus.title,
      whyWorthWriting: focus.whyWorthWriting,
      recommendedAngle: focus.recommendedAngle,
      platform: "朋友圈",
      missingInformation: gap,
      sourceBasis: `来自原始输入中的事实和矛盾：“${clip(tension, 42)}”。`,
      difference: focus.difference,
    },
  ];
}
