import { decorateGeneratedDrafts, type RawCreateDraft } from "./draft-generator";
import { constrainContentBrief } from "./content-brief";
import { checkDraftSimilarity } from "./similarity";
import {
  generationNotice,
  isCreateProviderError,
  LocalFallbackProvider,
  type CreateGenerationProvider,
  type DraftProviderInput,
  type ProviderCallMetadata,
} from "./provider";
import type { ContentBrief, CreateSourceMode, CreateTopicCandidate } from "./types";
import type { CreateVoiceSample, VoiceStyleProfile } from "./voice-style";

type DraftOnlyProvider = Pick<CreateGenerationProvider, "id" | "mode" | "createDrafts" | "regenerateDraft">;

function generationMetadata(
  provider: Pick<CreateGenerationProvider, "id" | "mode">,
  metadata: ProviderCallMetadata,
  slowThresholdMs: number,
) {
  return {
    mode: provider.mode,
    generationMode: provider.id,
    provider: provider.id,
    model: metadata.model,
    fallback: provider.mode === "deterministic_fallback",
    fallbackReason: null,
    notice: generationNotice(provider.mode),
    durationMs: metadata.durationMs,
    repairCount: metadata.repairCount,
    responseFormat: metadata.responseFormat,
    slowResponse: metadata.durationMs > slowThresholdMs,
  };
}

function modelBriefToContentBrief(brief: {
  whatHappened: string;
  concreteDetails: string[];
  personalReaction: string;
  tension: string;
  personalJudgment: string;
  unresolvedQuestion: string;
  possibleNextStep: string;
  confirmedFacts: string[];
  unverifiedClaims: string[];
  prohibitedClaims: string[];
  missingContext: string[];
}): ContentBrief {
  return { ...brief, externalReferences: [] };
}

function topicsForUi(
  topics: Array<{
    title: string;
    focus: string;
    whyWorthWriting: string;
    angle: string;
    missingInformation: string[];
    sourceGrounding: string[];
  }>,
  sourceText: string,
): CreateTopicCandidate[] {
  const keys: CreateTopicCandidate["key"][] = ["record", "perspective", "focus"];
  return topics.map((topic, index) => {
    const grounded = topic.sourceGrounding.filter((item) => sourceText.includes(item));
    return {
      key: keys[index],
      title: topic.title,
      whyWorthWriting: topic.whyWorthWriting,
      recommendedAngle: topic.angle,
      platform: "朋友圈",
      missingInformation: topic.missingInformation.join("；"),
      sourceBasis: grounded.length > 0 ? grounded.join("；") : "来自本次原始输入，发布前请核对。",
      difference: topic.focus,
    };
  });
}

function factIssues(drafts: RawCreateDraft[], input: DraftProviderInput) {
  const issues = new Set<string>();
  const retryKeys = new Set<RawCreateDraft["key"]>();
  for (const draft of drafts) {
    if (input.brief.prohibitedClaims.some((claim) => draft.body.includes(claim))) {
      issues.add("出现禁止声明");
      retryKeys.add(draft.key);
    }
    if (!input.brief.possibleNextStep && /接下来|下一步|以后要|准备去|打算/u.test(draft.body)) {
      issues.add("输入没有下一步，但稿件强制添加了下一步");
      retryKeys.add(draft.key);
    }
    if (input.brief.externalReferences.length > 0 && !/别人|外部|看到|听到|读到|观点来自/u.test(draft.body)) {
      issues.add("外部观点没有明确归属");
      retryKeys.add(draft.key);
    }
    if (!input.brief.personalJudgment && /人生|成长|教会了我|意义在于/u.test(draft.body)) {
      issues.add("生活内容被自动升华");
      retryKeys.add(draft.key);
    }
  }
  return { issues: Array.from(issues), retryKeys: Array.from(retryKeys) };
}

function qualityCheck(drafts: RawCreateDraft[], input: DraftProviderInput, voiceSamples: CreateVoiceSample[]) {
  const similarity = checkDraftSimilarity(drafts, voiceSamples);
  const facts = factIssues(drafts, input);
  return {
    valid: similarity.valid && facts.issues.length === 0,
    issues: Array.from(new Set([...similarity.issues, ...facts.issues])),
    retryKeys: Array.from(new Set([...similarity.retryKeys, ...facts.retryKeys])),
  };
}

function constrainDraftMetadata(draft: RawCreateDraft, sourceText: string): RawCreateDraft {
  return {
    ...draft,
    groundedFacts: draft.groundedFacts?.filter((fact) => sourceText.includes(fact)),
    unresolvedClaims: draft.unresolvedClaims?.filter((claim) => sourceText.includes(claim)),
  };
}

export async function generateDraftPackage(input: {
  provider: DraftOnlyProvider;
  brief: DraftProviderInput["brief"];
  topic: CreateTopicCandidate;
  sourceMode: CreateSourceMode;
  sourceText: string;
  voiceStyle: VoiceStyleProfile | null;
  voiceSamples: CreateVoiceSample[];
}) {
  const brief = constrainContentBrief(input.brief, input.sourceText);
  const providerInput: DraftProviderInput = {
    brief,
    topic: input.topic,
    sourceMode: input.sourceMode,
    sourceText: input.sourceText,
    voiceStyle: input.voiceStyle,
  };
  const initial = await input.provider.createDrafts(providerInput);
  let rawDrafts = initial.data.map((draft) => constrainDraftMetadata(draft, input.sourceText));
  let durationMs = initial.metadata.durationMs;
  let repairCount = initial.metadata.repairCount;
  let quality = qualityCheck(rawDrafts, providerInput, input.voiceSamples);
  let retryCount = 0;
  if (!quality.valid && quality.retryKeys.length > 0) {
    retryCount = 1;
    const replacementResults = await Promise.all(quality.retryKeys.map((key) => input.provider.regenerateDraft({
      ...providerInput,
      key,
      existingDrafts: rawDrafts,
      qualityIssues: quality.issues,
    })));
    durationMs += replacementResults.reduce((sum, result) => sum + result.metadata.durationMs, 0);
    repairCount += replacementResults.reduce((sum, result) => sum + result.metadata.repairCount, 0);
    const replacements = replacementResults.map((result) => constrainDraftMetadata(result.data, input.sourceText));
    const byKey = new Map(replacements.map((draft) => [draft.key, draft]));
    rawDrafts = rawDrafts.map((draft) => byKey.get(draft.key) ?? draft);
    quality = qualityCheck(rawDrafts, providerInput, input.voiceSamples);
  }
  return {
    drafts: decorateGeneratedDrafts(rawDrafts, { ...providerInput, voiceSamples: input.voiceSamples }),
    generation: generationMetadata(input.provider, { ...initial.metadata, durationMs, repairCount }, 35_000),
    qualityStatus: quality.valid ? "passed" as const : "insufficient" as const,
    qualityMessage: quality.valid ? null : "三个版本仍然过于相似，请保留当前人工稿并稍后重试。",
    qualityIssues: quality.issues,
    retryCount,
  };
}

export async function generateTopicPackage(input: {
  provider: CreateGenerationProvider;
  sourceMode: CreateSourceMode;
  sourceText: string;
  platform: "wechat_moments";
}) {
  const result = await input.provider.createTopicEnvelope(input);
  const brief = constrainContentBrief(modelBriefToContentBrief(result.data.brief), input.sourceText);
  const topics = topicsForUi(result.data.topics, input.sourceText);
  return {
    brief,
    topics,
    generation: generationMetadata(input.provider, result.metadata, 25_000),
  };
}

export async function withProviderFallback<T>(
  provider: CreateGenerationProvider,
  operation: (activeProvider: CreateGenerationProvider) => Promise<T>,
  options: { allowFallback?: boolean } = {},
) {
  try {
    return await operation(provider);
  } catch (error) {
    if (options.allowFallback !== true || isCreateProviderError(error, "timeout")) throw error;
    if (provider.mode === "deterministic_fallback") throw new Error("本地演示生成失败", { cause: error });
    return operation(new LocalFallbackProvider());
  }
}
