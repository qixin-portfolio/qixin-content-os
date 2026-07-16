import type {
  ContentBrief,
  CreateDraftCandidate,
  CreateSafetyCheck,
  CreateSourceMode,
  CreateTopicCandidate,
  GroundingContext,
} from "./types";
import { extractContentBrief } from "./content-brief";
import type { CreateVoiceSample } from "./voice-style";

export type RawCreateDraft = {
  key: "record" | "perspective" | "concise";
  body: string;
  approachDescription?: string;
  groundedFacts?: string[];
  unresolvedClaims?: string[];
};

type DraftInput = {
  sourceMode: CreateSourceMode;
  sourceText: string;
  groundingContext: GroundingContext;
  topic: CreateTopicCandidate;
  voiceSamples: CreateVoiceSample[];
};

function sentence(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const clean = value.trim().replace(/[。！？!?]+$/u, "");
  return `${clean}。`;
}

function uniqueParagraphs(values: Array<string | null | undefined>, limit = 4) {
  return Array.from(new Set(values.map(sentence).filter((item): item is string => Boolean(item)))).slice(0, limit);
}

function compactLead(value: string | null | undefined) {
  return value?.replace(/^(最近)?越来越觉得\s*|^我发现\s*|^我觉得\s*|^终于感觉\s*|^反而(?:让我)?\s*/u, "").trim() || null;
}

function externalDrafts(brief: ContentBrief): RawCreateDraft[] {
  const reference = brief.externalReferences[0] ?? "这个观点";
  const reaction = brief.personalReaction ?? "自己最近的经历";
  return [
    { key: "record", body: `我看到一个观点：${reference}。\n\n这是别人的观点。它让我想到的是${reaction}。` },
    { key: "perspective", body: `${sentence(reaction)}\n\n这个判断是由别人的“${reference}”引出来的，不是我原创的结论。` },
    { key: "concise", body: `“${reference}”是我看到的别人的观点。\n\n我想到的是${reaction}。` },
  ];
}

function fallbackRawDrafts(brief: ContentBrief, topic: CreateTopicCandidate): RawCreateDraft[] {
  if (brief.externalReferences.length > 0) return externalDrafts(brief);

  const details = brief.concreteDetails.length > 0 ? brief.concreteDetails : [brief.whatHappened];
  const firstDetail = details[0];
  const middleDetails = details.slice(1, 3);
  const lastDetail = details.at(-1) ?? firstDetail;
  const recordParagraphs = uniqueParagraphs([
    firstDetail,
    ...middleDetails,
    brief.tension && !details.some((detail) => brief.tension?.includes(detail)) ? brief.tension : null,
    brief.personalReaction,
  ]);
  const perspectiveOpening = compactLead(brief.personalJudgment
    ?? brief.personalReaction
    ?? brief.tension
    ?? topic.title);
  const perspectiveParagraphs = uniqueParagraphs([
    perspectiveOpening,
    firstDetail && !firstDetail.includes(perspectiveOpening ?? "") ? firstDetail : null,
    compactLead(brief.tension) !== perspectiveOpening ? compactLead(brief.tension) : null,
    brief.unresolvedQuestion,
  ]);
  const reopenMatch = firstDetail.match(/^(?:今天|昨天)?重新打开\s*(.+)$/u);
  const conciseParagraphs = reopenMatch
    ? uniqueParagraphs([reopenMatch[1], firstDetail.replace(reopenMatch[1], "").trim(), compactLead(brief.personalReaction ?? brief.personalJudgment)], 4)
    : uniqueParagraphs([
      compactLead(middleDetails[0] ?? brief.tension ?? lastDetail),
      compactLead(brief.personalReaction ?? brief.personalJudgment),
      middleDetails[0] ? compactLead(brief.tension) : null,
      brief.unresolvedQuestion,
    ], 4);

  return [
    { key: "record", body: recordParagraphs.join("\n\n") },
    { key: "perspective", body: perspectiveParagraphs.join("\n\n") },
    { key: "concise", body: conciseParagraphs.slice(0, Math.max(2, Math.min(4, conciseParagraphs.length))).join("\n\n") },
  ];
}

function safetyFor(context: GroundingContext): CreateSafetyCheck {
  const { sourceMode, rawInput } = context;
  return {
    sourceSummary: sourceMode === "manual"
      ? `来自本次手动输入：${rawInput.slice(0, 60)}${rawInput.length > 60 ? "…" : ""}`
      : `来自所选项目的真实事件摘要：${rawInput.slice(0, 60)}${rawInput.length > 60 ? "…" : ""}`,
    unconfirmedFacts: context.missingContext.length > 0
      ? context.missingContext
      : sourceMode === "manual" ? ["临时输入尚未经过项目证据核验，发布前请确认事实和时间。"] : [],
    privacyRisks: ["如使用截图，请检查客户姓名、手机号、微信和本地路径。"],
    imageNotes: ["优先使用真实工作过程或界面截图；没有合适配图也可以只发文字。"],
  };
}

export function decorateGeneratedDrafts(rawDrafts: RawCreateDraft[], input: DraftInput): CreateDraftCandidate[] {
  const definitions = {
    record: { name: "真实记录版" as const, difference: "从发生的事情开始" },
    perspective: { name: "个人观点版" as const, difference: "从你的判断开始" },
    concise: { name: "克制短版" as const, difference: "只保留最需要说的部分" },
  };
  const safety = safetyFor(input.groundingContext);
  const assetSuggestions = [
    "可以使用一张真实工作过程或现场照片。",
    "截图前遮挡账号、客户信息和本地文件路径。",
    "当前没有配图也可以只发文字。",
  ];
  return rawDrafts.map((draft) => ({
    ...draft,
    ...definitions[draft.key],
    lightweightWarnings: [
      ...(input.sourceMode === "manual" ? ["这部分来自你的临时输入，发布前请确认准确。"] : []),
      ...input.groundingContext.prohibitedClaims.map((claim) => `不要${claim}`),
    ].slice(0, 3),
    assetSuggestions,
    safety,
  }));
}

export function generateFallbackDrafts(input: DraftInput) {
  const brief = extractContentBrief(input.groundingContext.rawInput);
  return decorateGeneratedDrafts(fallbackRawDrafts(brief, input.topic), input);
}

export { fallbackRawDrafts };
