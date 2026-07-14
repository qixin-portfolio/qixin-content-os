import { reviewEditorialStyle, type EditorialVoiceProfile } from "../editorial/style-reviewer";
import type {
  CreateDraftCandidate,
  CreateSafetyCheck,
  CreateSourceMode,
  CreateTopicCandidate,
} from "./types";

type CreateVoiceSample = {
  platform: "wechat_moments" | "x" | "xiaohongshu" | "douyin";
  title?: string;
  body: string;
  qualityRating: number;
  sourceType: "manual_input" | "approved_draft" | "imported_post";
  approved: boolean;
  active: boolean;
};

type GenerateDraftInput = {
  sourceMode: CreateSourceMode;
  sourceText: string;
  topic: CreateTopicCandidate;
  voiceProfile: EditorialVoiceProfile | null;
  voiceSamples: CreateVoiceSample[];
};

const fallbackVoiceProfile: EditorialVoiceProfile = {
  id: "local-create-fallback",
  name: "朋友圈本地创作规则",
  platform: "wechat_moments",
  tone: "具体、克制、允许没做完",
  preferredWords: [],
  avoidWords: ["赋能", "闭环", "引爆", "颠覆"],
  writingRules: ["事情在前", "事实和判断分开", "CTA 可以为空"],
  exampleTexts: [],
};

export function calculateVoiceSampleWeight(sample: Pick<CreateVoiceSample, "qualityRating" | "sourceType">) {
  const qualityWeight = sample.qualityRating >= 5 ? 3 : sample.qualityRating === 4 ? 2 : 1;
  return qualityWeight * (sample.sourceType === "approved_draft" ? 1.5 : 1);
}

function styleIssueMessage(code: string) {
  const messages: Record<string, string> = {
    template_opening: "开头有点像模板，可以直接从具体事情开始。",
    sales_tone: "这一段有点像课程广告。",
    over_summary: "这一段有点像总结稿，可以少解释一句。",
    false_certainty: "这里的结论比较绝对。",
    avoid_word: "这里用了不适合当前语气的词。",
    generic_generated_hook: "开头有点像生成模板，可以直接进入事情。",
    excessive_punctuation: "标点有点用力，可以更自然。",
    excessive_emoji: "Emoji 有点多，可能削弱真实感。",
  };
  return messages[code] ?? "这里可以再确认是否像你平时会说的话。";
}

function safetyFor(sourceMode: CreateSourceMode, sourceText: string): CreateSafetyCheck {
  const manual = sourceMode === "manual";
  return {
    sourceSummary: manual
      ? `来自本次手动输入：${sourceText.slice(0, 60)}${sourceText.length > 60 ? "…" : ""}`
      : `来自所选项目的真实事件摘要：${sourceText.slice(0, 60)}${sourceText.length > 60 ? "…" : ""}`,
    unconfirmedFacts: manual
      ? ["临时输入尚未经过项目证据核验，发布前请确认事实和时间。"]
      : ["发布前请确认项目状态、结果和时间仍与现有资料一致。"],
    privacyRisks: ["如使用截图，请检查客户姓名、手机号、微信和本地路径。"],
    imageNotes: ["优先使用真实工作过程或界面截图；没有合适配图也可以只发文字。"],
  };
}

function contentOsDrafts(sourceText: string) {
  return {
    record: `${sourceText}\n\n做到这里才发现，功能变多和每天更容易开始写，并不是一回事。现在还没有完整答案，我先把这个偏差记下来。\n\n接下来想先把“每天知道该写什么”这一步做顺，其他功能再慢慢看。`,
    perspective: `最近做 Content OS，有一个很直接的感受：做得更多，不一定就更接近真正的问题。\n\n${sourceText}\n\n功能当然有用，但如果每天打开它，还是不知道该写什么，那最重要的那一步就还没解决。这个判断还要放回每天的使用里继续验证。`,
    concise: `${sourceText}\n\n功能越来越多，不代表最初的问题已经解决。\n\n先回到“每天知道该写什么”，其他的以后再加。`,
  };
}

function genericDrafts(sourceText: string, topic: CreateTopicCandidate) {
  return {
    record: `${sourceText}\n\n这件事现在还没有一个完整结论。我先把已经发生的记下来，哪些是事实、哪些只是自己的判断，后面再慢慢分清。`,
    perspective: `${sourceText}\n\n我现在更在意的是：${topic.title}\n\n先不急着把它说成一个确定结论。能确认的先写，不能确认的先留着。`,
    concise: `${sourceText}\n\n先记到这里。还没做完，也不用急着把话说满。`,
  };
}

export function generateCreateDrafts(input: GenerateDraftInput): CreateDraftCandidate[] {
  const sourceText = input.sourceText.trim();
  if (!sourceText) throw new Error("创作来源不能为空");
  const activeSamples = input.voiceSamples
    .filter((sample) => sample.active && sample.approved && sample.platform === "wechat_moments")
    .sort((left, right) => calculateVoiceSampleWeight(right) - calculateVoiceSampleWeight(left));
  const voiceProfile = input.voiceProfile ?? fallbackVoiceProfile;
  const sampleInput = activeSamples.map((sample) => ({
    platform: sample.platform,
    title: sample.title ?? "",
    body: sample.body,
    qualityRating: sample.qualityRating,
    approved: sample.approved,
  }));
  const isContentOsReflection = /Content OS|内容系统/i.test(sourceText)
    && /功能.*多|真正需要|每天.*写/.test(sourceText);
  const bodies = isContentOsReflection
    ? contentOsDrafts(sourceText)
    : genericDrafts(sourceText, input.topic);
  const safety = safetyFor(input.sourceMode, sourceText);
  const assetSuggestions = [
    "可以使用一张真实工作过程或产品界面截图。",
    "截图前遮挡账号、客户信息和本地文件路径。",
    "当前没有配图也可以只发文字。",
  ];

  const definitions = [
    { key: "record" as const, name: "真实记录版" as const, body: bodies.record, difference: "先记录具体发生的事，保留没做完和不确定。" },
    { key: "perspective" as const, name: "个人观点版" as const, body: bodies.perspective, difference: "从这次经历自然带出自己的判断，不把判断写成事实。" },
    { key: "concise" as const, name: "克制短版" as const, body: bodies.concise, difference: "删掉额外解释，只留下事实和当前判断。" },
  ];

  return definitions.map((definition) => {
    const review = reviewEditorialStyle({
      title: "",
      hook: "",
      body: definition.body,
      cta: "",
      voiceProfile,
      voiceSamples: sampleInput,
    });
    const warnings = [
      ...(input.sourceMode === "manual" ? ["这部分来自你的临时输入，发布前请确认准确。"] : []),
      ...review.issues.map((issue) => styleIssueMessage(issue.code)),
    ];
    return {
      ...definition,
      lightweightWarnings: Array.from(new Set(warnings)).slice(0, 3),
      assetSuggestions,
      safety,
    };
  });
}
