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

export const FALLBACK_NOTICE = "当前使用本地演示生成，文案可能带有模板感。";
export const MODEL_NOTICE = "正在根据你的素材生成不同表达。";

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

export interface CreateGenerationProvider {
  id: string;
  mode: CreateGenerationMode;
  createBrief(input: Omit<TopicProviderInput, "brief">): Promise<ContentBrief>;
  createTopics(input: TopicProviderInput): Promise<CreateTopicCandidate[]>;
  createDrafts(input: DraftProviderInput): Promise<RawCreateDraft[]>;
  regenerateDraft(input: RegenerateDraftInput): Promise<RawCreateDraft>;
}

export class LocalFallbackProvider implements CreateGenerationProvider {
  id = "deterministic_fallback";
  mode = "deterministic_fallback" as const;

  async createBrief(input: Omit<TopicProviderInput, "brief">) {
    return extractContentBrief(input.sourceText);
  }

  async createTopics(input: TopicProviderInput) {
    return generateFallbackTopics(input);
  }

  async createDrafts(input: DraftProviderInput) {
    return fallbackRawDrafts(input.brief, input.topic);
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
    return { key: input.key, body: paragraphs.join("\n\n") || `${input.brief.whatHappened}` };
  }
}

export function generationNotice(mode: CreateGenerationMode) {
  return mode === "model" ? MODEL_NOTICE : FALLBACK_NOTICE;
}
