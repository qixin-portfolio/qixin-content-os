import { decorateGeneratedDrafts, type RawCreateDraft } from "./draft-generator";
import { constrainContentBrief } from "./content-brief";
import { checkDraftSimilarity } from "./similarity";
import {
  generationNotice,
  LocalFallbackProvider,
  type CreateGenerationProvider,
  type DraftProviderInput,
} from "./provider";
import type { CreateSourceMode, CreateTopicCandidate } from "./types";
import type { CreateVoiceSample, VoiceStyleProfile } from "./voice-style";

type DraftOnlyProvider = Pick<CreateGenerationProvider, "id" | "mode" | "createDrafts" | "regenerateDraft">;

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
  let rawDrafts = await input.provider.createDrafts(providerInput);
  let quality = qualityCheck(rawDrafts, providerInput, input.voiceSamples);
  let retryCount = 0;
  if (!quality.valid && quality.retryKeys.length > 0) {
    retryCount = 1;
    const replacements = await Promise.all(quality.retryKeys.map((key) => input.provider.regenerateDraft({
      ...providerInput,
      key,
      existingDrafts: rawDrafts,
      qualityIssues: quality.issues,
    })));
    const byKey = new Map(replacements.map((draft) => [draft.key, draft]));
    rawDrafts = rawDrafts.map((draft) => byKey.get(draft.key) ?? draft);
    quality = qualityCheck(rawDrafts, providerInput, input.voiceSamples);
  }
  return {
    drafts: decorateGeneratedDrafts(rawDrafts, { ...providerInput, voiceSamples: input.voiceSamples }),
    generation: {
      mode: input.provider.mode,
      provider: input.provider.id,
      notice: generationNotice(input.provider.mode),
    },
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
  const brief = constrainContentBrief(await input.provider.createBrief(input), input.sourceText);
  const topics = await input.provider.createTopics({ ...input, brief });
  return {
    brief,
    topics,
    generation: {
      mode: input.provider.mode,
      provider: input.provider.id,
      notice: generationNotice(input.provider.mode),
    },
  };
}

export async function withProviderFallback<T>(
  provider: CreateGenerationProvider,
  operation: (activeProvider: CreateGenerationProvider) => Promise<T>,
) {
  try {
    return await operation(provider);
  } catch {
    if (provider.mode === "deterministic_fallback") throw new Error("本地演示生成失败");
    return operation(new LocalFallbackProvider());
  }
}
