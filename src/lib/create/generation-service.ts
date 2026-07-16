import { decorateGeneratedDrafts, type RawCreateDraft } from "./draft-generator";
import { checkDraftSimilarity } from "./similarity";
import { createGroundingContext, groundingWarnings } from "./grounding-context";
import {
  generationNotice,
  type CreateGenerationProvider,
  type DraftProviderInput,
  type ProviderCallMetadata,
} from "./provider";
import type { CreateSourceMode, CreateTopicCandidate, GroundingContext } from "./types";
import type { CreateVoiceSample } from "./voice-style";

type DraftOnlyProvider = Pick<CreateGenerationProvider, "id" | "mode" | "createDrafts">;

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
    promptCharacters: metadata.promptCharacters,
    promptBudgetExceeded: metadata.promptBudgetExceeded,
    slowResponse: metadata.durationMs > slowThresholdMs,
  };
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

function factIssues(drafts: RawCreateDraft[], context: GroundingContext) {
  const issues = new Set<string>();
  for (const draft of drafts) {
    if (/没(?:有)?正式上线|还没正式上线|未正式上线/u.test(context.rawInput)
      && /已经(?:正式)?上线|正式上线了/u.test(draft.body)) {
      issues.add("把未上线写成了已上线");
    }
    if (/客户验证(?:也|还|仍然)?不够|真实客户验证(?:也|还|仍然)?不够/u.test(context.rawInput)
      && /客户.{0,12}(?:充分|已经).{0,12}(?:认可|验证)|已经获得.{0,12}客户/u.test(draft.body)) {
      issues.add("把客户验证不足写成了客户认可或充分验证");
    }
    if (!/接下来|下一步|准备|打算|以后要/u.test(context.rawInput)
      && /接下来|下一步|以后要|准备去|打算/u.test(draft.body)) {
      issues.add("输入没有下一步，但稿件强制添加了下一步");
    }
    if (context.externalOpinionMarkers.length > 0 && !/别人|外部|看到|听到|读到|观点来自/u.test(draft.body)) {
      issues.add("外部观点没有明确归属");
    }
    if (!/我发现|我觉得|我认为|感觉|意义|人生|成长/u.test(context.rawInput)
      && /人生|成长|教会了我|意义在于/u.test(draft.body)) {
      issues.add("生活内容被自动升华");
    }
    if (!/用户数量|用户数|\d+\s*个用户/u.test(context.rawInput) && /\d+\s*个用户|用户数量/u.test(draft.body)) {
      issues.add("新增了输入中没有的用户数量");
    }
    if (!/收入|成交|营收|销售额/u.test(context.rawInput) && /收入|成交|营收|销售额/u.test(draft.body)) {
      issues.add("新增了输入中没有的收入或成交结果");
    }
  }
  return Array.from(issues);
}

function qualityCheck(drafts: RawCreateDraft[], context: GroundingContext, voiceSamples: CreateVoiceSample[]) {
  const similarity = checkDraftSimilarity(drafts, voiceSamples);
  const facts = factIssues(drafts, context);
  return {
    valid: similarity.valid && facts.length === 0,
    issues: Array.from(new Set([...similarity.issues, ...facts])),
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
  topic: CreateTopicCandidate;
  sourceMode: CreateSourceMode;
  sourceText: string;
  voiceStyleSummary: string;
  voiceSamples: CreateVoiceSample[];
}) {
  const groundingContext = createGroundingContext({
    rawInput: input.sourceText,
    sourceMode: input.sourceMode,
    platform: "wechat_moments",
  });
  const providerInput: DraftProviderInput = {
    groundingContext,
    topic: input.topic,
    voiceStyleSummary: input.voiceStyleSummary,
  };
  const initial = await input.provider.createDrafts(providerInput);
  const rawDrafts = initial.data.map((draft) => constrainDraftMetadata(draft, input.sourceText));
  const quality = qualityCheck(rawDrafts, groundingContext, input.voiceSamples);
  return {
    drafts: decorateGeneratedDrafts(rawDrafts, {
      groundingContext,
      topic: input.topic,
      sourceMode: input.sourceMode,
      sourceText: input.sourceText,
      voiceSamples: input.voiceSamples,
    }),
    generation: generationMetadata(input.provider, initial.metadata, 35_000),
    qualityStatus: quality.valid ? "passed" as const : "insufficient" as const,
    qualityMessage: quality.valid ? null : "候选稿未通过事实或差异检查，请保留原始输入并重试。",
    qualityIssues: quality.issues,
    retryCount: 0,
  };
}

export async function generateTopicPackage(input: {
  provider: CreateGenerationProvider;
  sourceMode: CreateSourceMode;
  sourceText: string;
  platform: "wechat_moments";
  voiceStyleSummary: string;
}) {
  const groundingContext = createGroundingContext({
    rawInput: input.sourceText,
    sourceMode: input.sourceMode,
    platform: input.platform,
  });
  const result = await input.provider.createTopics({
    groundingContext,
    voiceStyleSummary: input.voiceStyleSummary,
  });
  const topics = topicsForUi(result.data.topics, input.sourceText);
  return {
    topics,
    generation: generationMetadata(input.provider, result.metadata, 25_000),
    lightweightWarnings: groundingWarnings(groundingContext),
  };
}
