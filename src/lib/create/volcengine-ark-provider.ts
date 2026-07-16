import type { RawCreateDraft } from "./draft-generator";
import {
  CreateProviderError,
  isCreateProviderError,
  type CreateGenerationProvider,
  type DraftProviderInput,
  type DraftRepairInput,
  type ProviderResult,
  type TopicProviderInput,
} from "./provider";
import {
  normalizeDraftEnvelope,
  normalizeDraftItem,
  normalizeTopicEnvelope,
  parseStructuredJson,
  type StructuredDraft,
  type TopicEnvelope,
} from "./structured-output";

export const ARK_PROVIDER_TIMEOUT_MS = 60_000;
export const TOPIC_PROMPT_BUDGET = 4_000;
export const DRAFT_PROMPT_BUDGET = 6_000;
const ARK_CHAT_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
const TOPIC_MAX_TOKENS = 650;
const DRAFT_MAX_TOKENS = 1_800;
const VOICE_SUMMARY_BUDGET = 600;

type FetchLike = typeof fetch;
type StructuredNormalizer<T> = (value: unknown) => T;

function mapDraftType(type: StructuredDraft["type"]): RawCreateDraft["key"] {
  if (type === "scene_record") return "record";
  if (type === "thought_progression") return "perspective";
  return "concise";
}

function characterCount(value: string) {
  return Array.from(value).length;
}

function sliceCharacters(value: string, length: number) {
  return Array.from(value).slice(0, Math.max(0, length)).join("");
}

function contextSafety(input: TopicProviderInput["groundingContext"]) {
  return [
    `来源类型：${input.sourceMode}`,
    input.externalOpinionMarkers.length > 0 ? `外部观点标记：${input.externalOpinionMarkers.join("；")}` : "",
    input.prohibitedClaims.length > 0 ? `禁止改写：${input.prohibitedClaims.join("；")}` : "",
    input.missingContext.length > 0 ? `缺失信息：${input.missingContext.join("；")}` : "",
  ].filter(Boolean).join("\n");
}

function budgetedPrompt(input: {
  system: string;
  rawInput: string;
  safety: string;
  voiceStyleSummary: string;
  instruction: string;
  budget: number;
}) {
  const style = sliceCharacters(input.voiceStyleSummary.trim(), VOICE_SUMMARY_BUDGET);
  const makeUser = (voice: string) => [
    `原始输入：${input.rawInput}`,
    input.safety,
    voice ? `声音摘要：${voice}` : "",
    input.instruction,
  ].filter(Boolean).join("\n");
  const withoutStyle = makeUser("");
  const availableStyleCharacters = Math.max(
    0,
    input.budget - characterCount(input.system) - characterCount(withoutStyle) - characterCount("\n声音摘要："),
  );
  const user = makeUser(sliceCharacters(style, availableStyleCharacters));
  const promptCharacters = characterCount(input.system) + characterCount(user);
  return {
    system: input.system,
    user,
    promptCharacters,
    promptBudgetExceeded: promptCharacters > input.budget,
  };
}

function mapDraft(draft: StructuredDraft): RawCreateDraft {
  return {
    key: mapDraftType(draft.type),
    body: draft.content,
    approachDescription: draft.approachDescription,
    usedFacts: draft.usedFacts,
    inferredStatements: draft.inferredStatements,
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
  return new CreateProviderError("provider_error", "火山方舟调用失败，请稍后重试。");
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
      throw new CreateProviderError("provider_error", "无法连接火山方舟，请检查网络后重试。", { cause: error });
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
    promptCharacters: number;
    promptBudgetExceeded: boolean;
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
          promptCharacters: input.promptCharacters,
          promptBudgetExceeded: input.promptBudgetExceeded,
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
          promptCharacters: input.promptCharacters,
          promptBudgetExceeded: input.promptBudgetExceeded,
        },
      };
    } catch (error) {
      if (isCreateProviderError(error, "schema_validation_failed")) throw error;
      throw new CreateProviderError("schema_validation_failed", "真实模型返回格式不完整，请重试。", { cause: error });
    }
  }

  async createTopics(input: TopicProviderInput): Promise<ProviderResult<TopicEnvelope>> {
    const prompt = budgetedPrompt({
      system: "你是朋友圈选题编辑。只用原始输入，不补事实、经历、结果、情绪或下一步。只返回 JSON。",
      rawInput: input.groundingContext.rawInput,
      safety: contextSafety(input.groundingContext),
      voiceStyleSummary: input.voiceStyleSummary,
      instruction: "返回 topics，正好 3 条。每条字段：title, focus, whyWorthWriting, angle, missingInformation, sourceGrounding。没有信息时用空数组。",
      budget: TOPIC_PROMPT_BUDGET,
    });
    return this.requestStructured({
      ...prompt,
      repairShape: "{topics:[正好3条{title:string,focus:string,whyWorthWriting:string,angle:string,missingInformation:string[],sourceGrounding:string[]}]}",
      maxTokens: TOPIC_MAX_TOKENS,
      normalize: normalizeTopicEnvelope,
    });
  }

  async createDrafts(input: DraftProviderInput): Promise<ProviderResult<RawCreateDraft[]>> {
    const facts = [input.groundingContext.rawInput, ...(input.factAnswers ?? [])].filter(Boolean);
    const prompt = budgetedPrompt({
      system: "你是齐鑫朋友圈候选稿编辑。只能使用事实材料中的原话或其不新增细节的改写。没有来源时不得补时间、地点、动作、物件、身体感受、情绪、结果或下一步。只返回 JSON。",
      rawInput: facts.join("\n"),
      safety: contextSafety(input.groundingContext),
      voiceStyleSummary: input.voiceStyleSummary,
      instruction: `选题：${JSON.stringify(input.topic)}\n模式：${(input.detailMode ?? "sparse") === "sparse" ? "稀疏，短句和2-4短段，不追求画面" : "补充细节"}\n一次返回 drafts，正好包含 scene_record、thought_progression、restrained_short。每稿字段：type, content, approachDescription, usedFacts:[{claim,sourceQuote}], inferredStatements。每一个具体细节都必须有逐字 sourceQuote，sourceQuote 只能来自事实材料；inferredStatements 只能是抽象表达。三稿首句、组织顺序和结尾必须不同。`,
      budget: DRAFT_PROMPT_BUDGET,
    });
    const result = await this.requestStructured({
      ...prompt,
      repairShape: "{drafts:[正好3条{type:'scene_record'|'thought_progression'|'restrained_short',content:string,approachDescription:string,usedFacts:[{claim:string,sourceQuote:string}],inferredStatements:string[]}]}",
      maxTokens: DRAFT_MAX_TOKENS,
      normalize: normalizeDraftEnvelope,
    });
    const order: RawCreateDraft["key"][] = ["record", "perspective", "concise"];
    return {
      data: result.data.drafts.map(mapDraft).sort((left, right) => order.indexOf(left.key) - order.indexOf(right.key)),
      metadata: result.metadata,
    };
  }

  async repairDraft(input: DraftRepairInput): Promise<ProviderResult<RawCreateDraft>> {
    const expected = input.key === "record" ? "scene_record" : input.key === "perspective" ? "thought_progression" : "restrained_short";
    const facts = [input.sourceText, ...input.factAnswers].filter(Boolean);
    const result = await this.requestStructured({
      system: "你只修复一篇朋友圈稿。只能删除无来源细节、用用户原话替换或缩短；不得新增任何事实。只返回 JSON。",
      user: `允许事实：${facts.join("\n")}\n选题：${JSON.stringify(input.topic)}\n稿型：${expected}\n问题：${input.rejectedReasons.join("；")}\n返回 draft：{type,content,approachDescription,usedFacts:[{claim,sourceQuote}],inferredStatements}。sourceQuote 必须逐字来自允许事实。`,
      promptCharacters: 0,
      promptBudgetExceeded: false,
      repairShape: `{type:'${expected}',content:string,approachDescription:string,usedFacts:[{claim:string,sourceQuote:string}],inferredStatements:string[]}`,
      maxTokens: 900,
      normalize: normalizeDraftItem,
    });
    const draft = mapDraft(result.data);
    if (draft.key !== input.key) throw new CreateProviderError("schema_validation_failed", "修复稿型不正确，请补充真实信息后再生成。");
    return { data: draft, metadata: result.metadata };
  }
}
