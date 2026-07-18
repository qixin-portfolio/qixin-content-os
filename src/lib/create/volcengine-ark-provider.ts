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
import { sparseRealizationPrompt } from "./sparse-realization";

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
  if (type === "original_record") return "record";
  if (type === "restrained_judgment") return "perspective";
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
    interpretations: draft.interpretations,
  };
}

function repairRoleRequirement(key: RawCreateDraft["key"]) {
  if (key === "record") return "至少两句：先保留发生过程，再补一句从已有事实自然得出的发现；必须改变原输入的句序和表达，不能近似复述，也不能把原有名词换成‘某系统/某工具’，也不得用‘这说明’、‘可用性’或其他报告分类词替代具体事件。若事实同时有系统和入口，必须写成‘系统的入口是……’或‘入口不该只是网页’，绝不能写成‘入口不是系统，而是聊天工具’。";
  if (key === "perspective") return "写成带‘我’的完整推论：不只看什么，还要看什么，或为什么；不能只给结论标签，也不能写报告式分类、‘这说明’、‘可用性’、‘适配性’或‘可及性’。若事实同时有系统和入口，必须保持‘系统的入口是……’的关系，不能让聊天工具取代系统。";
  return "写成可独立传播的一句话，使用‘不是……而是……’、‘不该……而该……’或‘才发现：……’等重述结论；不能沿用原事记录的句序后再删字，也不能把系统与它的入口说成同一类事物。";
}

function sparseRelationshipGuidance(sourceText: string) {
  const systems = sourceText.match(/[A-Za-z][A-Za-z0-9]*(?:\s+[A-Za-z][A-Za-z0-9]*)*/gu) ?? [];
  const entry = ["微信", "钉钉", "飞书", "Slack"].find((term) => sourceText.includes(term));
  const system = systems.find((term) => term.trim().length >= 3)?.trim();
  if (!system || !entry) return "";
  return `本次事实里“${system}”是系统，“${entry}”是入口。只能写“${system} 的入口是/可以是 ${entry}”或“${entry} 是 ${system} 的主入口”；禁止写“入口不是 ${system}，而是 ${entry}”或“${entry} 取代 ${system}”。`;
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
    const facts = input.factLedger.facts.map((fact) => `${fact.id} | ${fact.sourceType} | ${fact.category} | ${fact.text}`);
    const relationshipGuidance = sparseRelationshipGuidance(input.groundingContext.rawInput);
    const sparsePlanInstruction = input.sparseRealization ? `\n${sparseRealizationPrompt(input.sparseRealization)}` : "";
    const prompt = budgetedPrompt({
      system: "你是齐鑫朋友圈候选稿编辑。只能使用事实表中的事实，允许正常改写和基于已有事实的克制推论，但不得新增具体细节。具体事实必须引用已有 fact ID；外部观点必须保留其外部来源归属。不得补时间、地点、人物、客户、交通工具、动作、物件、身体感受、结果或下一步。只返回 JSON。",
      rawInput: facts.join("\n"),
      safety: contextSafety(input.groundingContext),
      voiceStyleSummary: input.voiceStyleSummary,
      instruction: `选题：${JSON.stringify(input.topic)}\n模式：${input.detailMode === "sparse" ? `稀疏模式。按以下硬性结构写三份不同的表达：1) original_record 必须至少两句。第一句重组发生过程，第二句以‘我才发现/我意识到’写出已有事实带来的发现，并用‘不是……而是……’或同等对比展开；不得近似复述，也不要把已有名词泛化成‘某系统/某工具’。2) restrained_judgment 必须是带‘我’的两段推论，明确写出‘不只看什么，还要看什么’或为什么；不能是结论标签或报告分类。3) minimal_expression 必须是独立的一句，使用‘不是……而是……’、‘不该……而该……’或‘才发现：……’形成重述结论，不能删改前稿。${relationshipGuidance}${sparsePlanInstruction} 三稿依次回答：发生了什么、我因此怎么判断、最值得单独说的一句。禁止机械长中短缩写，以及‘这是某某场景下的认知变化’、‘这反映了’、‘这体现了’、‘这说明’、‘可用性’、‘适配性’、‘可及性’等报告腔。返回前逐项检查每份都满足对应结构。` : "补充细节模式：仍须让三稿分别承担记录、判断和独立短表达，不得增加未提供的具体事实。"}\n一次返回 drafts，正好包含 original_record、restrained_judgment、minimal_expression。每稿字段：type, content, approachDescription, usedFacts:[{claim,factIds}], interpretations:[{text,basisFactIds}]。factIds 只能引用事实表 ID。interpretations 只能是抽象判断，不能出现任何新的具体时间、地点、人物、客户、交通工具、动作、物件、身体感受、对话、数字或项目结果。三稿首句、组织顺序和结尾必须不同，且不得高度重合。`,
      budget: DRAFT_PROMPT_BUDGET,
    });
    const result = await this.requestStructured({
      ...prompt,
      repairShape: "{drafts:[正好3条{type:'original_record'|'restrained_judgment'|'minimal_expression',content:string,approachDescription:string,usedFacts:[{claim:string,factIds:string[]}],interpretations:[{text:string,basisFactIds:string[]}]}]}",
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
    const expected = input.key === "record" ? "original_record" : input.key === "perspective" ? "restrained_judgment" : "minimal_expression";
    const facts = input.factLedger.facts.map((fact) => `${fact.id} | ${fact.sourceType} | ${fact.category} | ${fact.text}`);
    const result = await this.requestStructured({
      system: "你只修复一篇朋友圈稿。只能删除无来源细节、正常改写已有事实或作克制推论；不得新增事实。具体事实必须引用事实表 ID，外部观点必须保留外部归属。original_record 不能复制原输入，restrained_judgment 不得使用报告式分类语言，minimal_expression 必须是独立完整的一句。只返回 JSON。",
      user: `事实表：${facts.join("\n")}\n允许引用的 fact IDs：${input.allowedFactIds.join(", ")}\n模式：${input.detailMode}\n选题：${JSON.stringify(input.topic)}\n稿型：${expected}\n本稿必须做到：${repairRoleRequirement(input.key)}\n${input.sparseRealization ? sparseRealizationPrompt(input.sparseRealization) : sparseRelationshipGuidance(input.factLedger.facts.map((fact) => fact.text).join("\n"))}\n问题：${input.rejectedReasons.join("；")}\n返回 draft：{type,content,approachDescription,usedFacts:[{claim,factIds}],interpretations:[{text,basisFactIds}]}。factIds 只能来自允许列表。`,
      promptCharacters: 0,
      promptBudgetExceeded: false,
      repairShape: `{type:'${expected}',content:string,approachDescription:string,usedFacts:[{claim:string,factIds:string[]}],interpretations:[{text:string,basisFactIds:string[]}]}`,
      maxTokens: 900,
      normalize: normalizeDraftItem,
    });
    const draft = mapDraft(result.data);
    if (draft.key !== input.key) throw new CreateProviderError("schema_validation_failed", "修复稿型不正确，请补充真实信息后再生成。");
    return { data: draft, metadata: result.metadata };
  }
}
