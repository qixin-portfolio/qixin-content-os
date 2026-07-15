import { z } from "zod";
import type { RawCreateDraft } from "./draft-generator";
import {
  CreateProviderError,
  isCreateProviderError,
  type CreateGenerationProvider,
  type DraftProviderInput,
  type ProviderResult,
  type RegenerateDraftInput,
  type TopicProviderInput,
} from "./provider";
import {
  normalizeDraftEnvelope,
  normalizeDraftItem,
  normalizeTopicGenerationEnvelope,
  parseStructuredJson,
  type StructuredDraft,
  type TopicGenerationEnvelope,
} from "./structured-output";

export const ARK_PROVIDER_TIMEOUT_MS = 120_000;
const ARK_CHAT_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
const TOPIC_MAX_TOKENS = 1_000;
const DRAFT_MAX_TOKENS = 1_800;

type FetchLike = typeof fetch;
type StructuredNormalizer<T> = (value: unknown) => T;

const singleDraftResponseSchema = z.object({ draft: z.unknown() }).strict();

function mapDraftType(type: StructuredDraft["type"]): RawCreateDraft["key"] {
  if (type === "scene_record") return "record";
  if (type === "thought_progression") return "perspective";
  return "concise";
}

function mapDraft(draft: StructuredDraft): RawCreateDraft {
  return {
    key: mapDraftType(draft.type),
    body: draft.content,
    approachDescription: draft.approachDescription,
    groundedFacts: draft.groundedFacts,
    unresolvedClaims: draft.unresolvedClaims,
  };
}

function providerHttpFailure(status: number, body: string) {
  let errorCode = "";
  let errorType = "";
  let message = "";
  try {
    const payload = JSON.parse(body) as { error?: { code?: unknown; type?: unknown; message?: unknown } };
    errorCode = String(payload.error?.code ?? "");
    errorType = String(payload.error?.type ?? "");
    message = String(payload.error?.message ?? "");
  } catch {}
  const diagnostic = `${errorCode} ${errorType} ${message}`.toLowerCase();
  if (status === 401 || status === 403) {
    return new CreateProviderError("authentication_failed", "火山方舟鉴权失败，请检查本地配置。");
  }
  if (status === 404 || /model.{0,20}not.{0,10}found|endpoint.{0,20}not.{0,10}found/u.test(diagnostic)) {
    return new CreateProviderError("model_or_endpoint_not_found", "火山方舟模型或推理接入点不可用。");
  }
  if (status === 402 || /billing|balance|overdue|insufficient|quota/u.test(diagnostic)) {
    return new CreateProviderError("billing_unavailable", "火山方舟账号当前没有可用调用额度。");
  }
  if (status === 429) {
    return new CreateProviderError("rate_limited", "火山方舟请求过于频繁，请稍后重试。");
  }
  return new CreateProviderError("unexpected_provider_error", "火山方舟调用失败，请稍后重试。");
}

export class VolcengineArkCreateProvider implements CreateGenerationProvider {
  id = "volcengine_ark";
  mode = "model" as const;

  constructor(
    private readonly apiKey: string,
    private readonly modelId: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs: number = ARK_PROVIDER_TIMEOUT_MS,
  ) {
    if (!apiKey.trim() || !modelId.trim()) throw new Error("ARK_API_KEY and ARK_MODEL_ID are required");
  }

  private async requestContent(system: string, user: string, maxTokens: number) {
    let response: Response;
    try {
      response = await this.fetchImpl(ARK_CHAT_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.modelId,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          max_tokens: maxTokens,
          stream: false,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
        throw new CreateProviderError("timeout", "火山方舟响应超时，请稍后重试。", { cause: error });
      }
      throw new CreateProviderError("unexpected_provider_error", "无法连接火山方舟，请检查网络后重试。", { cause: error });
    }

    const body = await response.text();
    if (!response.ok) throw providerHttpFailure(response.status, body);
    let payload: { choices?: Array<{ message?: { content?: unknown } }> };
    try {
      payload = JSON.parse(body) as typeof payload;
    } catch (error) {
      throw new CreateProviderError("schema_validation_failed", "真实模型返回格式不完整，请重试。", { cause: error });
    }
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new CreateProviderError("schema_validation_failed", "真实模型返回格式不完整，请重试。");
    }
    return content;
  }

  private async requestStructured<T>(input: {
    system: string;
    user: string;
    repairShape: string;
    maxTokens: number;
    normalize: StructuredNormalizer<T>;
  }): Promise<ProviderResult<T>> {
    const started = Date.now();
    const firstContent = await this.requestContent(input.system, input.user, input.maxTokens);
    try {
      return {
        data: input.normalize(parseStructuredJson(firstContent)),
        metadata: {
          model: this.modelId,
          durationMs: Date.now() - started,
          repairCount: 0,
          responseFormat: "json_object",
        },
      };
    } catch (error) {
      if (!isCreateProviderError(error, "schema_validation_failed")) throw error;
    }

    const repairContent = await this.requestContent(
      "你只修复 JSON 结构。不得改写或新增事实、经历、情绪、判断、结果和下一步；缺少内容只能补空字符串或空数组。只返回 JSON。",
      `目标结构：${input.repairShape}\n待修复内容：${firstContent}`,
      input.maxTokens,
    );
    try {
      return {
        data: input.normalize(parseStructuredJson(repairContent)),
        metadata: {
          model: this.modelId,
          durationMs: Date.now() - started,
          repairCount: 1,
          responseFormat: "json_object",
        },
      };
    } catch (error) {
      if (isCreateProviderError(error, "schema_validation_failed")) throw error;
      throw new CreateProviderError("schema_validation_failed", "真实模型返回格式不完整，请重试。", { cause: error });
    }
  }

  async createTopicEnvelope(input: Omit<TopicProviderInput, "brief">): Promise<ProviderResult<TopicGenerationEnvelope>> {
    return this.requestStructured({
      system: "你是事实编辑和朋友圈选题编辑。只使用用户明确提供的信息，不补经历、结果、情绪、下一步或成果。不解释推理过程，只返回 JSON。",
      user: `来源类型：${input.sourceMode}\n原始输入：${input.sourceText}\n一次返回 brief 和正好 3 条 topics。brief 字段：whatHappened, concreteDetails, personalReaction, tension, personalJudgment, unresolvedQuestion, possibleNextStep, confirmedFacts, unverifiedClaims, prohibitedClaims, missingContext。topics 每条字段：title, focus, whyWorthWriting, angle, platform(固定 wechat_moments), missingInformation, sourceGrounding。没有内容时使用空字符串或空数组。`,
      repairShape: "{brief:{whatHappened:string,concreteDetails:string[],personalReaction:string,tension:string,personalJudgment:string,unresolvedQuestion:string,possibleNextStep:string,confirmedFacts:string[],unverifiedClaims:string[],prohibitedClaims:string[],missingContext:string[]},topics:[正好3条{title:string,focus:string,whyWorthWriting:string,angle:string,platform:'wechat_moments',missingInformation:string[],sourceGrounding:string[]}]}",
      maxTokens: TOPIC_MAX_TOKENS,
      normalize: normalizeTopicGenerationEnvelope,
    });
  }

  async createDrafts(input: DraftProviderInput): Promise<ProviderResult<RawCreateDraft[]>> {
    const result = await this.requestStructured({
      system: "你是齐鑫朋友圈候选稿编辑。只使用给定事实、感受和判断；不编造场景、成果、反馈或下一步，不复制样本句子，不强行升华或添加 CTA。不解释推理，只返回 JSON。",
      user: `选题：${JSON.stringify(input.topic)}\nContentBrief：${JSON.stringify(input.brief)}\n声音结构摘要：${JSON.stringify(input.voiceStyle)}\n一次返回 drafts，正好包含 scene_record、thought_progression、restrained_short 三种。每稿字段：type, content, approachDescription, groundedFacts, unresolvedClaims。三稿的首句、组织顺序和结尾必须不同。`,
      repairShape: "{drafts:[正好3条{type:'scene_record'|'thought_progression'|'restrained_short',content:string,approachDescription:string,groundedFacts:string[],unresolvedClaims:string[]}]}",
      maxTokens: DRAFT_MAX_TOKENS,
      normalize: normalizeDraftEnvelope,
    });
    const order: RawCreateDraft["key"][] = ["record", "perspective", "concise"];
    return {
      data: result.data.drafts.map(mapDraft).sort((left, right) => order.indexOf(left.key) - order.indexOf(right.key)),
      metadata: result.metadata,
    };
  }

  async regenerateDraft(input: RegenerateDraftInput): Promise<ProviderResult<RawCreateDraft>> {
    const expectedType = input.key === "record" ? "scene_record" : input.key === "perspective" ? "thought_progression" : "restrained_short";
    const result = await this.requestStructured({
      system: "只修正一个结构重复的朋友圈版本。保持事实边界，不增加情节、结果、下一步或结论，不做同义词随机替换，只返回 JSON。",
      user: `目标类型：${expectedType}\n质量问题：${input.qualityIssues.join("；")}\nContentBrief：${JSON.stringify(input.brief)}\n已有版本：${JSON.stringify(input.existingDrafts)}\n返回 draft，字段：type, content, approachDescription, groundedFacts, unresolvedClaims。`,
      repairShape: `{draft:{type:'${expectedType}',content:string,approachDescription:string,groundedFacts:string[],unresolvedClaims:string[]}}`,
      maxTokens: 900,
      normalize: (value) => {
        const envelope = singleDraftResponseSchema.safeParse(value);
        if (!envelope.success) {
          throw new CreateProviderError("schema_validation_failed", "真实模型返回格式不完整，请重试。", { cause: envelope.error });
        }
        const draft = normalizeDraftItem(envelope.data.draft);
        if (draft.type !== expectedType) {
          throw new CreateProviderError("schema_validation_failed", "真实模型返回格式不完整，请重试。");
        }
        return draft;
      },
    });
    return { data: mapDraft(result.data), metadata: result.metadata };
  }
}
