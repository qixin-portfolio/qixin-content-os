export type EditorialPlatform = "wechat_moments" | "x" | "xiaohongshu" | "douyin";

export type EditorialVoiceProfile = {
  id: string;
  name: string;
  platform: EditorialPlatform;
  tone: string;
  preferredWords: string[];
  avoidWords: string[];
  writingRules: string[];
  exampleTexts: string[];
};

export type EditorialVoiceSample = {
  platform: EditorialPlatform;
  title: string;
  body: string;
  qualityRating: number;
  approved: boolean;
};

export type StyleIssueSeverity = "low" | "medium" | "high";
export type StyleIssueField = "title" | "hook" | "body" | "cta";

export type StyleIssue = {
  code: string;
  severity: StyleIssueSeverity;
  field: StyleIssueField;
  excerpt: string;
  explanation: string;
};

export type StyleSuggestion = {
  field: StyleIssueField;
  originalText: string;
  suggestedText: string;
  reason: string;
};

export type StyleReviewDraft = {
  overallScore: number;
  aiToneScore: number;
  authenticityScore: number;
  clarityScore: number;
  salesToneScore: number;
  issues: StyleIssue[];
  suggestions: StyleSuggestion[];
};

type EditorialText = {
  title: string;
  hook: string;
  body: string;
  cta: string;
};

type StyleReviewInput = EditorialText & {
  voiceProfile: EditorialVoiceProfile;
  voiceSamples: EditorialVoiceSample[];
};

const templateOpenings = [
  "你有没有发现",
  "在这个时代",
  "随着 AI 的发展",
  "今天想和大家分享",
  "很多人都不知道",
  "万万没想到",
];

const salesPhrases = [
  "赶紧收藏",
  "建议点赞收藏",
  "私信我领取",
  "手把手教你",
  "保姆级教程",
  "闭眼冲",
  "普通人也能逆袭",
];

const summaryPhrases = [
  "这不仅仅是",
  "更是",
  "这不是",
  "而是",
  "归根结底",
  "总而言之",
  "让我们一起",
];

const certaintyPhrases = ["一定", "绝对", "百分百", "必然", "彻底改变"];

const fieldNames: StyleIssueField[] = ["title", "hook", "body", "cta"];

function clamp(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function excerpt(text: string, phrase: string) {
  const index = text.indexOf(phrase);
  if (index < 0) return text.slice(0, 40);
  return text.slice(Math.max(0, index - 12), Math.min(text.length, index + phrase.length + 24));
}

function withoutPhrase(text: string, phrase: string) {
  return text.split(phrase).join("").replace(/^\s+|\s+$/g, "");
}

function addPatternIssues(
  texts: Record<StyleIssueField, string>,
  issues: StyleIssue[],
  suggestions: StyleSuggestion[],
  phrases: string[],
  issue: Omit<StyleIssue, "field" | "excerpt"> & { code: string },
  onlyAtStart = false,
) {
  for (const field of fieldNames) {
    const text = texts[field];
    for (const phrase of phrases) {
      const found = onlyAtStart
        ? text.trimStart().startsWith(phrase)
        : text.includes(phrase);
      if (!found) continue;

      issues.push({
        ...issue,
        field,
        excerpt: excerpt(text, phrase),
      });
      suggestions.push({
        field,
        originalText: text,
        suggestedText: withoutPhrase(text, phrase),
        reason: issue.explanation,
      });
    }
  }
}

function emojiCount(text: string) {
  return Array.from(text).filter((character) => {
    const code = character.codePointAt(0) ?? 0;
    return (code >= 0x1f300 && code <= 0x1faff) || (code >= 0x2600 && code <= 0x27bf);
  }).length;
}

function calculateAuthenticity(
  texts: EditorialText,
  voiceProfile: EditorialVoiceProfile,
  voiceSamples: EditorialVoiceSample[],
) {
  const approvedSamples = voiceSamples.filter(
    (sample) => sample.approved && sample.platform === voiceProfile.platform,
  );
  if (approvedSamples.length === 0) return 35;

  const content = Object.values(texts).join(" ");
  const preferredMatches = voiceProfile.preferredWords.filter((word) => content.includes(word)).length;
  const sampleWords = approvedSamples
    .flatMap((sample) => `${sample.title} ${sample.body}`.split(/\s+/))
    .filter(Boolean);
  const sampleMatches = sampleWords.filter((word) => word.length > 1 && content.includes(word)).length;
  const sampleSignal = Math.min(30, sampleMatches * 3);
  return clamp(45 + Math.min(25, preferredMatches * 10) + sampleSignal);
}

export function reviewEditorialStyle({
  title,
  hook,
  body,
  cta,
  voiceProfile,
  voiceSamples,
}: StyleReviewInput): StyleReviewDraft {
  const texts: Record<StyleIssueField, string> = { title, hook, body, cta };
  const issues: StyleIssue[] = [];
  const suggestions: StyleSuggestion[] = [];

  addPatternIssues(
    texts,
    issues,
    suggestions,
    templateOpenings,
    {
      code: "template_opening",
      severity: "medium",
      explanation: "开头使用常见模板句，建议直接从这次具体经历或问题开始。",
    },
    true,
  );
  addPatternIssues(
    texts,
    issues,
    suggestions,
    salesPhrases,
    {
      code: "sales_tone",
      severity: "high",
      explanation: "这句话带有课程或营销号式行动号召，不符合克制的人工记录语气。",
    },
  );
  addPatternIssues(
    texts,
    issues,
    suggestions,
    summaryPhrases,
    {
      code: "over_summary",
      severity: "medium",
      explanation: "使用了过度总结或对仗句式，容易让文本显得像模板文案。",
    },
  );
  addPatternIssues(
    texts,
    issues,
    suggestions,
    certaintyPhrases,
    {
      code: "false_certainty",
      severity: "high",
      explanation: "使用绝对化表达，可能把有限事实写成确定结论。",
    },
  );

  for (const field of fieldNames) {
    const text = texts[field];
    if (field === "hook" && /^从.+开始，记录/.test(text.trim())) {
      issues.push({
        code: "generic_generated_hook",
        severity: "medium",
        field,
        excerpt: text.slice(0, 80),
        explanation: "Hook 使用了泛化的“从……开始，记录……”模板，建议直接从具体事实开始，或留空。",
      });
      suggestions.push({
        field,
        originalText: text,
        suggestedText: "",
        reason: "删除模板化 Hook，直接从具体事实开始，不补写新的经历。",
      });
    }
    for (const word of voiceProfile.avoidWords) {
      if (!word || !text.includes(word)) continue;
      issues.push({
        code: "avoid_word",
        severity: "high",
        field,
        excerpt: excerpt(text, word),
        explanation: `命中 VoiceProfile 禁用词“${word}”，需要删除或改成具体事实。`,
      });
      suggestions.push({
        field,
        originalText: text,
        suggestedText: withoutPhrase(text, word),
        reason: `删除禁用词“${word}”，不补写新的成果或承诺。`,
      });
    }
  }

  for (const field of fieldNames) {
    const text = texts[field];
    if (/!{3,}|！{3,}/.test(text) || (field === "title" && /[!！?？]/.test(text) && /[()（）“”"「」]/.test(text))) {
      issues.push({
        code: "excessive_punctuation",
        severity: "medium",
        field,
        excerpt: text.slice(0, 60),
        explanation: "标点组合过于用力，建议保留自然叙述语气。",
      });
      suggestions.push({
        field,
        originalText: text,
        suggestedText: text.replace(/!{3,}/g, "！").replace(/！{3,}/g, "！"),
        reason: "减少情绪化标点，不额外强化语气。",
      });
    }
    if (emojiCount(text) >= 3) {
      issues.push({
        code: "excessive_emoji",
        severity: "medium",
        field,
        excerpt: text.slice(0, 60),
        explanation: "Emoji 连续堆叠，容易产生平台营销文案感。",
      });
    }
  }

  const severityPenalty = issues.reduce((total, issue) => total + (
    issue.severity === "high" ? 18 : issue.severity === "medium" ? 10 : 5
  ), 0);
  const aiToneScore = clamp(100 - severityPenalty);
  const salesToneScore = clamp(
    issues.filter((issue) => issue.code === "sales_tone").length * 24
      + issues.filter((issue) => issue.code === "avoid_word").length * 8,
  );
  const authenticityScore = calculateAuthenticity(texts, voiceProfile, voiceSamples);
  const clarityScore = clamp(body.trim() ? (body.length > 1800 ? 65 : 88) : 20);
  const overallScore = clamp((aiToneScore + authenticityScore + clarityScore + (100 - salesToneScore)) / 4);

  return {
    overallScore,
    aiToneScore,
    authenticityScore,
    clarityScore,
    salesToneScore,
    issues,
    suggestions,
  };
}
