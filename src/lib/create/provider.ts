import { extractContentBrief } from "./content-brief";
import { fallbackRawDrafts } from "./draft-generator";
import { generateFallbackTopics } from "./topic-generator";
import type { RawCreateDraft } from "./draft-generator";
import type {
  ContentBrief,
  CreateGenerationMode,
  CreateSourceMode,
  CreateTopicCandidate,
} from "./types";
import type { VoiceStyleProfile } from "./voice-style";
import type { TopicGenerationEnvelope } from "./structured-output";

export const FALLBACK_NOTICE = "本地演示内容可能带有模板感，不代表真实模型效果。";
export const MODEL_NOTICE = "正在根据你的素材生成不同表达。";

export type CreateProviderErrorCode =
  | "api_key_missing"
  | "model_id_missing"
  | "timeout"
  | "authentication_failed"
  | "model_or_endpoint_not_found"
  | "billing_unavailable"
  | "rate_limited"
  | "schema_validation_failed"
  | "unexpected_provider_error";

export class CreateProviderError extends Error {
  constructor(
    public readonly code: CreateProviderErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CreateProviderError";
  }
}

export function isCreateProviderError(error: unknown, code?: CreateProviderErrorCode): error is CreateProviderError {
  return error instanceof CreateProviderError && (!code || error.code === code);
}

export function createProviderHttpStatus(error: CreateProviderError) {
  if (error.code === "api_key_missing" || error.code === "model_id_missing") return 503;
  if (error.code === "timeout") return 504;
  if (error.code === "authentication_failed") return 401;
  if (error.code === "rate_limited") return 429;
  return 502;
}

export type TopicProviderInput = {
  sourceMode: CreateSourceMode;
  sourceText: string;
  platform: "wechat_moments";
  brief: ContentBrief;
};

export type DraftProviderInput = {
  sourceMode: CreateSourceMode;
  sourceText: string;
  brief: ContentBrief;
  topic: CreateTopicCandidate;
  voiceStyle: VoiceStyleProfile | null;
};

export type RegenerateDraftInput = DraftProviderInput & {
  key: RawCreateDraft["key"];
  existingDrafts: RawCreateDraft[];
  qualityIssues: string[];
};

export type ProviderCallMetadata = {
  model: string | null;
  durationMs: number;
  repairCount: number;
  responseFormat: "json_object" | "local";
};

export type ProviderResult<T> = {
  data: T;
  metadata: ProviderCallMetadata;
};

export interface CreateGenerationProvider {
  id: string;
  mode: CreateGenerationMode;
  createTopicEnvelope(input: Omit<TopicProviderInput, "brief">): Promise<ProviderResult<TopicGenerationEnvelope>>;
  createDrafts(input: DraftProviderInput): Promise<ProviderResult<RawCreateDraft[]>>;
  regenerateDraft(input: RegenerateDraftInput): Promise<ProviderResult<RawCreateDraft>>;
}

function localMetadata(): ProviderCallMetadata {
  return { model: null, durationMs: 0, repairCount: 0, responseFormat: "local" };
}

export class LocalFallbackProvider implements CreateGenerationProvider {
  id = "deterministic_fallback";
  mode = "deterministic_fallback" as const;

  async createTopicEnvelope(input: Omit<TopicProviderInput, "brief">) {
    const brief = extractContentBrief(input.sourceText);
    const topics = generateFallbackTopics({ ...input, brief });
    return {
      data: {
        brief: {
          whatHappened: brief.whatHappened,
          concreteDetails: brief.concreteDetails,
          personalReaction: brief.personalReaction ?? "",
          tension: brief.tension ?? "",
          personalJudgment: brief.personalJudgment ?? "",
          unresolvedQuestion: brief.unresolvedQuestion ?? "",
          possibleNextStep: brief.possibleNextStep ?? "",
          confirmedFacts: brief.confirmedFacts,
          unverifiedClaims: brief.unverifiedClaims,
          prohibitedClaims: brief.prohibitedClaims,
          missingContext: brief.missingContext,
        },
        topics: topics.map((topic) => ({
          title: topic.title,
          focus: topic.difference,
          whyWorthWriting: topic.whyWorthWriting,
          angle: topic.recommendedAngle,
          platform: "wechat_moments" as const,
          missingInformation: topic.missingInformation ? [topic.missingInformation] : [],
          sourceGrounding: topic.sourceBasis ? [topic.sourceBasis] : [],
        })),
      },
      metadata: localMetadata(),
    };
  }

  async createDrafts(input: DraftProviderInput) {
    return { data: fallbackRawDrafts(input.brief, input.topic), metadata: localMetadata() };
  }

  async regenerateDraft(input: RegenerateDraftInput) {
    const details = input.brief.concreteDetails;
    const compact = (value: string | null | undefined) => value?.replace(/^(最近)?越来越觉得\s*|^我发现\s*|^我觉得\s*|^终于感觉\s*|^反而(?:让我)?\s*/u, "").trim() || null;
    const values = input.key === "record"
      ? [details[0], details.at(-1), input.brief.personalReaction, input.brief.tension]
      : input.key === "perspective"
        ? [compact(input.brief.personalJudgment ?? input.brief.personalReaction ?? input.brief.tension), details[0], input.brief.unresolvedQuestion, details.at(-1)]
        : [compact(input.brief.tension ?? details.at(-1)), details[0], compact(input.brief.personalJudgment), input.brief.unresolvedQuestion];
    const paragraphs = Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))))
      .map((value) => `${value.replace(/[。！？!?]+$/u, "")}。`)
      .slice(0, 4);
    return {
      data: { key: input.key, body: paragraphs.join("\n\n") || `${input.brief.whatHappened}` },
      metadata: localMetadata(),
    };
  }
}

export function generationNotice(mode: CreateGenerationMode) {
  return mode === "model" ? MODEL_NOTICE : FALLBACK_NOTICE;
}
