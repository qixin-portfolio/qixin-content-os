import { z } from "zod";
import { CreateProviderError } from "./provider";

const nullableString = z.string().trim().max(2_000);
const shortString = z.string().trim().min(1).max(240);
const stringList = z.array(z.string().trim().min(1).max(500)).max(12);

const normalizedBriefSchema = z.object({
  whatHappened: z.string().trim().min(1).max(2_000),
  concreteDetails: stringList,
  personalReaction: nullableString,
  tension: nullableString,
  personalJudgment: nullableString,
  unresolvedQuestion: nullableString,
  possibleNextStep: nullableString,
  confirmedFacts: stringList,
  unverifiedClaims: stringList,
  prohibitedClaims: stringList,
  missingContext: stringList,
}).strict();

const normalizedTopicSchema = z.object({
  title: z.string().trim().min(1).max(80),
  focus: shortString,
  whyWorthWriting: shortString,
  angle: shortString,
  platform: z.literal("wechat_moments"),
  missingInformation: z.array(z.string().trim().min(1).max(240)).max(8),
  sourceGrounding: z.array(z.string().trim().min(1).max(500)).max(8),
}).strict();

export const topicGenerationEnvelopeSchema = z.object({
  brief: normalizedBriefSchema,
  topics: z.array(normalizedTopicSchema).length(3),
}).strict();

const normalizedDraftSchema = z.object({
  type: z.enum(["scene_record", "thought_progression", "restrained_short"]),
  content: z.string().trim().min(1).max(4_000),
  approachDescription: z.string().trim().min(1).max(240),
  groundedFacts: z.array(z.string().trim().min(1).max(500)).max(12),
  unresolvedClaims: z.array(z.string().trim().min(1).max(500)).max(12),
}).strict();

export const draftEnvelopeSchema = z.object({
  drafts: z.array(normalizedDraftSchema).length(3),
}).strict().superRefine((value, context) => {
  const types = new Set(value.drafts.map((draft) => draft.type));
  for (const type of ["scene_record", "thought_progression", "restrained_short"] as const) {
    if (!types.has(type)) {
      context.addIssue({ code: "custom", path: ["drafts"], message: `Missing draft type: ${type}` });
    }
  }
});

export type TopicGenerationEnvelope = z.infer<typeof topicGenerationEnvelopeSchema>;
export type DraftEnvelope = z.infer<typeof draftEnvelopeSchema>;
export type StructuredDraft = z.infer<typeof normalizedDraftSchema>;

function schemaFailure(cause?: unknown): never {
  throw new CreateProviderError("schema_validation_failed", "真实模型返回格式不完整，请重试。", { cause });
}

export function parseStructuredJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch (directError) {
    const fenced = content.match(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/iu);
    if (!fenced) return schemaFailure(directError);
    try {
      return JSON.parse(fenced[1]);
    } catch (fencedError) {
      return schemaFailure(fencedError);
    }
  }
}

function emptyString(value: unknown) {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value.trim() : value;
}

function safeStringList(value: unknown) {
  if (value === null || value === undefined || value === "") return [];
  if (typeof value === "string") return [value.trim()].filter(Boolean);
  if (!Array.isArray(value)) return value;
  return value.map((item) => typeof item === "string" ? item.trim() : item).filter((item) => item !== "");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeTopicGenerationEnvelope(input: unknown): TopicGenerationEnvelope {
  const envelope = record(input);
  const brief = record(envelope.brief);
  const topics = Array.isArray(envelope.topics) ? envelope.topics.map((item) => {
    const topic = record(item);
    return {
      ...topic,
      title: emptyString(topic.title),
      focus: emptyString(topic.focus),
      whyWorthWriting: emptyString(topic.whyWorthWriting),
      angle: emptyString(topic.angle),
      missingInformation: safeStringList(topic.missingInformation),
      sourceGrounding: safeStringList(topic.sourceGrounding),
    };
  }) : envelope.topics;
  const normalized = {
    ...envelope,
    brief: {
      ...brief,
      whatHappened: emptyString(brief.whatHappened),
      concreteDetails: safeStringList(brief.concreteDetails),
      personalReaction: emptyString(brief.personalReaction),
      tension: emptyString(brief.tension),
      personalJudgment: emptyString(brief.personalJudgment),
      unresolvedQuestion: emptyString(brief.unresolvedQuestion),
      possibleNextStep: emptyString(brief.possibleNextStep),
      confirmedFacts: safeStringList(brief.confirmedFacts),
      unverifiedClaims: safeStringList(brief.unverifiedClaims),
      prohibitedClaims: safeStringList(brief.prohibitedClaims),
      missingContext: safeStringList(brief.missingContext),
    },
    topics,
  };
  const parsed = topicGenerationEnvelopeSchema.safeParse(normalized);
  if (!parsed.success) return schemaFailure(parsed.error);
  return parsed.data;
}

function normalizeDraftCandidate(input: unknown) {
  const draft = record(input);
  return {
    ...draft,
    type: emptyString(draft.type),
    content: emptyString(draft.content),
    approachDescription: emptyString(draft.approachDescription),
    groundedFacts: safeStringList(draft.groundedFacts),
    unresolvedClaims: safeStringList(draft.unresolvedClaims),
  };
}

export function normalizeDraftItem(input: unknown): StructuredDraft {
  const parsed = normalizedDraftSchema.safeParse(normalizeDraftCandidate(input));
  if (!parsed.success) return schemaFailure(parsed.error);
  return parsed.data;
}

export function normalizeDraftEnvelope(input: unknown): DraftEnvelope {
  const envelope = record(input);
  const drafts = Array.isArray(envelope.drafts) ? envelope.drafts.map(normalizeDraftCandidate) : envelope.drafts;
  const parsed = draftEnvelopeSchema.safeParse({ ...envelope, drafts });
  if (!parsed.success) return schemaFailure(parsed.error);
  return parsed.data;
}
