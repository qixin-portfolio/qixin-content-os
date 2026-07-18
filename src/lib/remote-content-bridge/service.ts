import { z } from "zod";
import { generateDraftPackage, generateTopicPackage } from "../create/generation-service.ts";
import { createFactQuestions } from "../create/fact-questions.ts";
import { createGenerationProvider } from "../create/provider-factory.ts";
import type { CreateGenerationProvider } from "../create/provider.ts";
import type { CreateDraftCandidate, CreateTopicCandidate } from "../create/types.ts";
import { getPrisma } from "../prisma.ts";
import { extractVoiceStyleProfile, selectVoiceSamplesForPrompt, summarizeVoiceStyle, type CreateVoiceSample } from "../create/voice-style.ts";

export const REMOTE_CONTENT_MODEL = "doubao-seed-character-260628";

const sourceMaterialSchema = z.object({
  sourceId: z.string().regex(/^SRC-[A-Za-z0-9_-]{8,64}$/u),
  title: z.string().min(1).max(500),
  author: z.string().max(300).optional().default(""),
  sourceUrl: z.string().url().refine((value) => /^https?:\/\//iu.test(value)),
  excerpt: z.string().min(1).max(800),
}).strict();

const sourceInputSchema = z.object({
  rawInput: z.string().min(1).max(12_000),
  sourceMode: z.enum(["personal_note", "external_material"]),
  sourceMaterials: z.array(sourceMaterialSchema).max(10),
}).strict();

const topicSchema = z.object({
  key: z.enum(["record", "perspective", "focus"]),
  title: z.string().min(1),
  whyWorthWriting: z.string().min(1),
  recommendedAngle: z.string().min(1),
  platform: z.literal("朋友圈"),
  missingInformation: z.string(),
  sourceBasis: z.string(),
  difference: z.string(),
}).strict();

const draftInputSchema = sourceInputSchema.extend({
  selectedTopic: topicSchema,
  factAnswers: z.array(z.string().max(2_000)).max(3).default([]),
  detailMode: z.enum(["sparse", "enriched"]),
}).strict();

export type RemoteSourceMaterial = z.infer<typeof sourceMaterialSchema>;
export type RemoteSourceInput = z.infer<typeof sourceInputSchema>;
export type RemoteDraftInput = z.infer<typeof draftInputSchema>;

export type RemoteTopic = CreateTopicCandidate;
export type RemoteDraft = Pick<CreateDraftCandidate, "key" | "body"> & { status: "通过" | "已修复" };

function hasLocalPath(value: string) {
  return /(?:^|[\s"'`])(?:\/Users\/|\/private\/|~\/|\.\.\/|[A-Za-z]:\\)/u.test(value)
    || /(?:private-backups|\/Downloads\/)/iu.test(value);
}

export function hasUnverifiedProjectReadRequest(value: string) {
  return /(?:读取|查看|参考|看看).{0,12}(?:项目|资料|文档)|(?:去\s*)?(?:codex|项目).{0,12}(?:看看|查看|读取|参考)|资料.{0,12}(?:电脑|读取|查看)/iu.test(value);
}

function validateSource(input: unknown): RemoteSourceInput {
  const parsed = sourceInputSchema.safeParse(input);
  if (!parsed.success) throw new Error("来源材料格式不正确。");
  if (hasLocalPath(parsed.data.rawInput)) throw new Error("不接受本机路径作为创作素材。");
  if (hasUnverifiedProjectReadRequest(parsed.data.rawInput)) {
    throw new Error("当前内容桥接没有项目资料读取权限，请补充真实项目信息或使用授权项目读取入口。");
  }
  if (parsed.data.sourceMaterials.some((material) => hasLocalPath(JSON.stringify(material)))) {
    throw new Error("来源材料不能包含本机路径。");
  }
  if (parsed.data.sourceMode === "external_material" && parsed.data.sourceMaterials.length === 0) {
    throw new Error("外部素材模式需要已授权的来源材料。");
  }
  return parsed.data;
}

export function prepareRemoteSource(input: unknown) {
  const parsed = validateSource(input);
  const materialText = parsed.sourceMaterials.map((material) => [
    `外部材料：${material.title}`,
    material.author ? `作者：${material.author}` : "",
    `原始链接：${material.sourceUrl}`,
    `内容摘要：${material.excerpt}`,
  ].filter(Boolean).join("\n")).join("\n\n");
  return {
    ...parsed,
    createSourceMode: parsed.sourceMode === "external_material" ? "external_material" as const : "manual" as const,
    sourceText: parsed.sourceMode === "external_material"
      ? `${materialText}\n\n用户请求：${parsed.rawInput}`
      : parsed.rawInput.trim(),
  };
}

function assertRemoteProvider(provider: CreateGenerationProvider) {
  if (provider.id !== "volcengine_ark" || provider.mode !== "model") {
    throw new Error("远程桥接只允许使用已配置的真实模型（火山方舟）。");
  }
}

export function createRemoteGenerationProvider(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.ARK_MODEL_ID?.trim() !== REMOTE_CONTENT_MODEL) {
    throw new Error(`远程桥接要求模型 ${REMOTE_CONTENT_MODEL} 已配置。`);
  }
  const provider = createGenerationProvider(environment);
  assertRemoteProvider(provider);
  return provider;
}

export async function loadRemoteVoiceStyleSummary() {
  const samples = await getPrisma().voiceSample.findMany({
    where: { platform: "wechat_moments", approved: true, active: true },
    orderBy: [{ qualityRating: "desc" }, { updatedAt: "desc" }],
    select: { platform: true, body: true, qualityRating: true, sourceType: true, approved: true, active: true },
  });
  return summarizeVoiceStyle(extractVoiceStyleProfile(selectVoiceSamplesForPrompt(samples)));
}

type TopicDependencies = { provider: CreateGenerationProvider; voiceStyleSummary: string };
type DraftDependencies = TopicDependencies & { voiceSamples?: CreateVoiceSample[] };

export async function createRemoteTopics(input: unknown, dependencies: TopicDependencies) {
  const source = prepareRemoteSource(input);
  assertRemoteProvider(dependencies.provider);
  const result = await generateTopicPackage({
    provider: dependencies.provider,
    sourceMode: source.createSourceMode,
    sourceText: source.sourceText,
    platform: "wechat_moments",
    voiceStyleSummary: dependencies.voiceStyleSummary,
  });
  return {
    status: "ok" as const,
    generationMode: result.generation.generationMode,
    provider: result.generation.provider,
    model: result.generation.model,
    fallback: result.generation.fallback,
    topics: result.topics,
    factQuestions: createFactQuestions({ sourceText: source.sourceText, sourceMode: source.createSourceMode }).slice(0, 3),
  };
}

export async function createRemoteDrafts(input: unknown, dependencies: DraftDependencies) {
  const parsed = draftInputSchema.safeParse(input);
  if (!parsed.success) throw new Error("选题或事实补充格式不正确。");
  const source = prepareRemoteSource({
    rawInput: parsed.data.rawInput,
    sourceMode: parsed.data.sourceMode,
    sourceMaterials: parsed.data.sourceMaterials,
  });
  assertRemoteProvider(dependencies.provider);
  const result = await generateDraftPackage({
    provider: dependencies.provider,
    topic: parsed.data.selectedTopic,
    sourceMode: source.createSourceMode,
    sourceText: source.sourceText,
    voiceStyleSummary: dependencies.voiceStyleSummary,
    voiceSamples: dependencies.voiceSamples ?? [],
    factAnswers: parsed.data.factAnswers.map((answer) => answer.trim()).filter(Boolean),
    detailMode: parsed.data.detailMode,
    qualityProfile: parsed.data.detailMode === "sparse" && source.createSourceMode === "manual"
      ? "remote_content_bridge_sparse_personal"
      : "default",
  });
  return {
    status: "ok" as const,
    fallback: result.generation.fallback,
    drafts: result.drafts.map((draft): RemoteDraft => ({
      key: draft.key,
      body: draft.body,
      status: draft.qualityStatus === "repaired" ? "已修复" : "通过",
    })),
  };
}
