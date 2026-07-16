import { extractContentBrief } from "./content-brief";
import { fallbackRawDrafts } from "./draft-generator";
import { generateFallbackTopics } from "./topic-generator";
import type { RawCreateDraft } from "./draft-generator";
import type {
  CreateGenerationMode,
  CreateTopicCandidate,
  GroundingContext,
} from "./types";
import type { TopicEnvelope } from "./structured-output";

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
  | "provider_error";

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
  groundingContext: GroundingContext;
  voiceStyleSummary: string;
};

export type DraftProviderInput = {
  groundingContext: GroundingContext;
  topic: CreateTopicCandidate;
  voiceStyleSummary: string;
  factAnswers?: string[];
  detailMode?: "enriched" | "sparse";
};
export type DraftRepairInput = {
  sourceText: string;
  factAnswers: string[];
  detailMode: "enriched" | "sparse";
  topic: CreateTopicCandidate;
  key: "record" | "perspective" | "concise";
  rejectedReasons: string[];
};

export type ProviderCallMetadata = {
  model: string | null;
  durationMs: number;
  repairCount: number;
  responseFormat: "json_object" | "local";
  promptCharacters: number;
  promptBudgetExceeded: boolean;
};

export type ProviderResult<T> = {
  data: T;
  metadata: ProviderCallMetadata;
};

export interface CreateGenerationProvider {
  id: string;
  mode: CreateGenerationMode;
  createTopics(input: TopicProviderInput): Promise<ProviderResult<TopicEnvelope>>;
  createDrafts(input: DraftProviderInput): Promise<ProviderResult<RawCreateDraft[]>>;
  repairDraft?(input: DraftRepairInput): Promise<ProviderResult<RawCreateDraft>>;
}

function localMetadata(): ProviderCallMetadata {
  return {
    model: null,
    durationMs: 0,
    repairCount: 0,
    responseFormat: "local",
    promptCharacters: 0,
    promptBudgetExceeded: false,
  };
}

export class LocalFallbackProvider implements CreateGenerationProvider {
  id = "deterministic_fallback";
  mode = "deterministic_fallback" as const;

  async createTopics(input: TopicProviderInput) {
    const { groundingContext } = input;
    const brief = extractContentBrief(groundingContext.rawInput);
    const topics = generateFallbackTopics({
      sourceMode: groundingContext.sourceMode,
      sourceText: groundingContext.rawInput,
      platform: groundingContext.platform,
      brief,
    });
    return {
      data: {
        topics: topics.map((topic) => ({
          title: topic.title,
          focus: topic.difference,
          whyWorthWriting: topic.whyWorthWriting,
          angle: topic.recommendedAngle,
          missingInformation: topic.missingInformation ? [topic.missingInformation] : [],
          sourceGrounding: topic.sourceBasis ? [topic.sourceBasis] : [],
        })),
      },
      metadata: localMetadata(),
    };
  }

  async createDrafts(input: DraftProviderInput) {
    const brief = extractContentBrief(input.groundingContext.rawInput);
    return { data: fallbackRawDrafts(brief, input.topic).map((draft) => ({ ...draft, usedFacts: [{ claim: draft.body, sourceQuote: input.groundingContext.rawInput }], inferredStatements: [] })), metadata: localMetadata() };
  }
  async repairDraft(input: DraftRepairInput) {
    const brief = extractContentBrief(input.sourceText);
    const draft = fallbackRawDrafts(brief, input.topic).find((item) => item.key === input.key)!;
    return { data: { ...draft, usedFacts: [{ claim: draft.body, sourceQuote: input.sourceText }], inferredStatements: [] }, metadata: localMetadata() };
  }
}

export function generationNotice(mode: CreateGenerationMode) {
  return mode === "model" ? MODEL_NOTICE : FALLBACK_NOTICE;
}
