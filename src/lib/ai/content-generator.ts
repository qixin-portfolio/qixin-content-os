import type { ContentAngleDraft } from "../content/angle-generator";
import type { ContentScoreDraft } from "../content/content-scorer";
import { factCheck } from "../content/fact-check.ts";

export type EventCard = {
  id: string;
  title: string;
  whatHappened: string;
  whyItMatters: string;
  problem: string;
  result: string;
  personalReflection: string;
  evidenceRequired: string;
  status: string;
};

export type MasterContent = {
  eventCardId: string;
  title: string;
  hook: string;
  story: string;
  insight: string;
  reflection: string;
  cta: string;
  status: string;
};

export type VoiceProfileInput = {
  id: string;
  name: string;
  platform: "wechat_moments" | "x" | "xiaohongshu" | "douyin";
  tone: string;
  preferredWords: string[];
  avoidWords: string[];
  writingRules: string[];
  exampleTexts: string[];
};

export type IntelligentEventCard = EventCard & {
  sourceItems?: Array<{ id: string }>;
  sourceItemIds?: string[];
};

export type IntelligentMasterContent = {
  title: string;
  hook: string;
  story: string;
  insight: string;
  reflection: string;
  cta: string;
  factReferences: string[];
};

export function generateMasterContent(eventCard: EventCard): MasterContent {
  const result = factCheck(eventCard);

  if (!result.valid) {
    throw new Error(`Cannot generate content: ${result.errors.join(", ")}`);
  }

  return {
    eventCardId: eventCard.id,
    title: eventCard.title,
    hook: "这次先解决数据边界，再谈界面呈现。",
    story: `${eventCard.whatHappened}${eventCard.problem}${eventCard.result}`,
    insight: eventCard.whyItMatters,
    reflection: eventCard.personalReflection,
    cta: "你在做项目时，最先确认的是哪条数据边界？",
    status: "drafting",
  };
}

function removeAvoidWords(value: string, avoidWords: string[]) {
  return avoidWords.reduce((result, word) => word ? result.split(word).join("") : result, value);
}

export function generateMasterContentFromIntelligence({
  eventCard,
  contentScore,
  selectedAngle,
  voiceProfile,
}: {
  eventCard: IntelligentEventCard;
  contentScore: ContentScoreDraft;
  selectedAngle?: ContentAngleDraft;
  voiceProfile?: VoiceProfileInput;
}): IntelligentMasterContent {
  const factResult = factCheck(eventCard);
  if (!factResult.valid) {
    throw new Error(`Cannot generate content: ${factResult.errors.join(", ")}`);
  }
  if (!selectedAngle) {
    throw new Error("selectedAngle is required");
  }
  if (!voiceProfile) {
    throw new Error("voiceProfile is required");
  }
  if (contentScore.recommendation === "archive_only") {
    throw new Error("Cannot generate content for archive_only recommendation");
  }

  const factReferences = eventCard.sourceItems?.map((sourceItem) => sourceItem.id)
    ?? eventCard.sourceItemIds
    ?? [];
  if (factReferences.length === 0) {
    throw new Error("SourceItem references are required");
  }

  const draft = {
    title: eventCard.title,
    hook: `从${selectedAngle.title}开始，记录${eventCard.title}。`,
    story: `${eventCard.whatHappened}\n\n问题：${eventCard.problem}\n\n结果：${eventCard.result}`,
    insight: `${selectedAngle.coreIdea}\n\n${eventCard.whyItMatters}`,
    reflection: eventCard.personalReflection,
    cta: "先把这次过程记录下来，后面再用证据继续补齐。",
    factReferences,
  };

  return {
    ...draft,
    title: removeAvoidWords(draft.title, voiceProfile.avoidWords),
    hook: removeAvoidWords(draft.hook, voiceProfile.avoidWords),
    story: removeAvoidWords(draft.story, voiceProfile.avoidWords),
    insight: removeAvoidWords(draft.insight, voiceProfile.avoidWords),
    reflection: removeAvoidWords(draft.reflection, voiceProfile.avoidWords),
    cta: removeAvoidWords(draft.cta, voiceProfile.avoidWords),
  };
}
