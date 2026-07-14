export type CreateVoiceSample = {
  platform: "wechat_moments" | "x" | "xiaohongshu" | "douyin";
  title?: string;
  body: string;
  qualityRating: number;
  sourceType: "manual_input" | "approved_draft" | "imported_post";
  approved: boolean;
  active: boolean;
};

export type VoiceStyleProfile = {
  sampleCount: number;
  averageParagraphs: number;
  averageParagraphLength: number;
  openingModes: Array<"scene" | "judgment" | "reference" | "object">;
  judgmentPosition: "early" | "middle" | "late" | "mixed";
  openEndingPreference: number;
  uncertaintyPreference: number;
  selfDeprecationPreference: number;
  emotionIntensity: "low" | "medium" | "high";
  principles: string[];
};

export function calculateVoiceSampleWeight(sample: Pick<CreateVoiceSample, "qualityRating" | "sourceType">) {
  const qualityWeight = sample.qualityRating >= 5 ? 4 : sample.qualityRating === 4 ? 2.5 : 1;
  return qualityWeight * (sample.sourceType === "approved_draft" ? 2 : 1);
}

function openingMode(body: string): VoiceStyleProfile["openingModes"][number] {
  const first = body.trim().split(/\n|[。！？!?]/u)[0] ?? "";
  if (/看到|听到|读到|观点|有人说|朋友说/u.test(first)) return "reference";
  if (/我觉得|我发现|感觉|越来越/u.test(first)) return "judgment";
  if (/昨天|今天|早上|晚上|出门|等|打开|回到/u.test(first)) return "scene";
  return "object";
}

function judgmentRatio(body: string) {
  const paragraphs = body.split(/\n\s*\n/u).filter(Boolean);
  const index = paragraphs.findIndex((paragraph) => /我觉得|我发现|感觉|判断|更像|说明/u.test(paragraph));
  return index < 0 ? 0.5 : index / Math.max(1, paragraphs.length - 1);
}

function weightedRatio(samples: CreateVoiceSample[], predicate: (body: string) => boolean) {
  const total = samples.reduce((sum, sample) => sum + calculateVoiceSampleWeight(sample), 0);
  if (total === 0) return 0;
  return samples.reduce((sum, sample) => sum + (predicate(sample.body) ? calculateVoiceSampleWeight(sample) : 0), 0) / total;
}

export function extractVoiceStyleProfile(input: CreateVoiceSample[]): VoiceStyleProfile {
  const samples = input.filter((sample) => sample.active && sample.approved && sample.platform === "wechat_moments");
  const totalWeight = samples.reduce((sum, sample) => sum + calculateVoiceSampleWeight(sample), 0) || 1;
  const paragraphTotal = samples.reduce((sum, sample) => {
    const count = sample.body.split(/\n\s*\n/u).filter(Boolean).length;
    return sum + count * calculateVoiceSampleWeight(sample);
  }, 0);
  const paragraphLengthTotal = samples.reduce((sum, sample) => {
    const paragraphs = sample.body.split(/\n\s*\n/u).filter(Boolean);
    const average = paragraphs.length
      ? paragraphs.reduce((total, paragraph) => total + Array.from(paragraph).length, 0) / paragraphs.length
      : 0;
    return sum + average * calculateVoiceSampleWeight(sample);
  }, 0);
  const judgment = samples.reduce((sum, sample) => sum + judgmentRatio(sample.body) * calculateVoiceSampleWeight(sample), 0) / totalWeight;
  const exclamationRate = weightedRatio(samples, (body) => (body.match(/[！!]/gu)?.length ?? 0) >= 2);

  return {
    sampleCount: samples.length,
    averageParagraphs: Math.round((paragraphTotal / totalWeight) * 10) / 10,
    averageParagraphLength: Math.round(paragraphLengthTotal / totalWeight),
    openingModes: Array.from(new Set(samples.map((sample) => openingMode(sample.body)))),
    judgmentPosition: judgment < 0.34 ? "early" : judgment > 0.66 ? "late" : samples.length > 1 ? "mixed" : "middle",
    openEndingPreference: Math.round(weightedRatio(samples, (body) => /…|\.\.\.|不知道|没做完|还没|[？?]$/u.test(body.trim())) * 100) / 100,
    uncertaintyPreference: Math.round(weightedRatio(samples, (body) => /不知道|没想明白|没做完|还没|不确定|证明不了/u.test(body)) * 100) / 100,
    selfDeprecationPreference: Math.round(weightedRatio(samples, (body) => /我也不懂|我不行|暴论|瞎折腾|菜/u.test(body)) * 100) / 100,
    emotionIntensity: exclamationRate > 0.45 ? "high" : exclamationRate > 0.15 ? "medium" : "low",
    principles: ["具体", "口语", "少解释", "不端着", "不强行升华", "允许停在未完成状态"],
  };
}
