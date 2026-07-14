import type { CreateSourceMode, CreateTopicCandidate } from "./types";

type GenerateTopicInput = {
  sourceMode: CreateSourceMode;
  sourceText: string;
  platform: "wechat_moments";
};

function cleanSnippet(value: string, maxLength = 28) {
  const compact = value.replace(/\s+/g, " ").replace(/[。！？.!?]+$/u, "").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}…` : compact;
}

function missingInformation(sourceMode: CreateSourceMode, sourceText: string) {
  if (sourceMode === "manual" && sourceText.trim().length < 12) {
    return "可以再补一句发生了什么，生成结果会更具体；这部分来自你的临时输入，发布前请确认准确。";
  }
  if (sourceMode === "manual") {
    return "这部分来自你的临时输入，发布前请确认准确。";
  }
  return "请在发布前确认项目状态和结果仍与现有资料一致。";
}

export function generateCreateTopics(input: GenerateTopicInput): CreateTopicCandidate[] {
  const sourceText = input.sourceText.trim();
  if (input.sourceMode === "x") {
    throw new Error("X 收藏研究库尚未接入当前版本");
  }
  if (!sourceText) throw new Error("请先写下一句话，或选择一个最近项目");

  const gap = missingInformation(input.sourceMode, sourceText);
  const isContentOsReflection = /Content OS|内容系统/i.test(sourceText)
    && /功能.*多|真正需要|每天.*写/.test(sourceText);

  if (isContentOsReflection) {
    return [
      {
        key: "record",
        title: "功能越来越多，为什么反而更难开始写？",
        whyWorthWriting: "它记录了产品能力增加后，真实使用目标反而变模糊的过程。",
        recommendedAngle: "先讲功能越做越多，再讲自己重新看到的那个问题。",
        platform: "朋友圈",
        missingInformation: gap,
      },
      {
        key: "perspective",
        title: "我真正需要的，不是更多功能",
        whyWorthWriting: "这不是功能清单，而是一次对真实需求的重新判断。",
        recommendedAngle: "从自己的使用感受出发，区分“做得多”和“真正有用”。",
        platform: "朋友圈",
        missingInformation: gap,
      },
      {
        key: "focus",
        title: "做内容系统时，我差点忘了最初的问题",
        whyWorthWriting: "承认方向走偏，比包装成完整成果更接近真实创作过程。",
        recommendedAngle: "保留没做完的状态，写清下一步只想先解决什么。",
        platform: "朋友圈",
        missingInformation: gap,
      },
    ];
  }

  const snippet = cleanSnippet(sourceText);
  return [
    {
      key: "record",
      title: `先把“${snippet}”这件事记下来`,
      whyWorthWriting: "具体发生过的事情，是最可靠的内容起点。",
      recommendedAngle: "事情在前，只写已经发生和自己当时的感受。",
      platform: "朋友圈",
      missingInformation: gap,
    },
    {
      key: "perspective",
      title: "这件事改变了我什么判断？",
      whyWorthWriting: "个人判断从经历里长出来，比先讲道理更自然。",
      recommendedAngle: "先保留原始经历，再补一句现在怎么看。",
      platform: "朋友圈",
      missingInformation: gap,
    },
    {
      key: "focus",
      title: "现在能确认的，和还没做完的",
      whyWorthWriting: "把事实、判断和未完成状态分开，内容会更可信。",
      recommendedAngle: "删掉不必要解释，停在当前真实进度。",
      platform: "朋友圈",
      missingInformation: gap,
    },
  ];
}
