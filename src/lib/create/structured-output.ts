import { z } from "zod";
import { CreateProviderError } from "./provider";

const shortString = z.string().trim().min(1).max(240);
const minimalTopicSchema = z.object({
  title: z.string().trim().min(1).max(80),
  focus: shortString,
  whyWorthWriting: shortString,
  angle: shortString,
  missingInformation: z.array(z.string().trim().min(1).max(240)).max(8),
  sourceGrounding: z.array(z.string().trim().min(1).max(500)).max(8),
}).strict();

export const topicEnvelopeSchema = z.object({
  topics: z.array(minimalTopicSchema).length(3),
}).strict();

const factIdSchema = z.string().trim().regex(/^F[1-9]\d*$/u);

const normalizedDraftSchema = z.object({
  type: z.enum(["original_record", "restrained_judgment", "minimal_expression"]),
  content: z.string().trim().min(1).max(4_000),
  approachDescription: z.string().trim().min(1).max(240),
  usedFacts: z.array(z.object({ claim: z.string().trim().min(1).max(500), factIds: z.array(factIdSchema).min(1).max(8) }).strict()).max(12),
  interpretations: z.array(z.object({ text: z.string().trim().min(1).max(500), basisFactIds: z.array(factIdSchema).min(1).max(8) }).strict()).max(8),
}).strict();

export const draftEnvelopeSchema = z.object({
  drafts: z.array(normalizedDraftSchema).length(3),
}).strict().superRefine((value, context) => {
  const types = new Set(value.drafts.map((draft) => draft.type));
  for (const type of ["original_record", "restrained_judgment", "minimal_expression"] as const) {
    if (!types.has(type)) {
      context.addIssue({ code: "custom", path: ["drafts"], message: `Missing draft type: ${type}` });
    }
  }
});

export type TopicEnvelope = z.infer<typeof topicEnvelopeSchema>;
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

function normalizeTopicCandidate(input: unknown) {
  const topic = record(input);
  return {
    ...topic,
    title: emptyString(topic.title),
    focus: emptyString(topic.focus),
    whyWorthWriting: emptyString(topic.whyWorthWriting),
    angle: emptyString(topic.angle),
    missingInformation: safeStringList(topic.missingInformation),
    sourceGrounding: safeStringList(topic.sourceGrounding),
  };
}

export function normalizeTopicEnvelope(input: unknown): TopicEnvelope {
  const envelope = record(input);
  const topics = Array.isArray(envelope.topics)
    ? envelope.topics.map(normalizeTopicCandidate)
    : envelope.topics;
  const parsed = topicEnvelopeSchema.safeParse({ ...envelope, topics });
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
    usedFacts: Array.isArray(draft.usedFacts) ? draft.usedFacts : [],
    interpretations: Array.isArray(draft.interpretations) ? draft.interpretations : [],
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
