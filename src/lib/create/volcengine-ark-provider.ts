import { z } from "zod";
import type { RawCreateDraft } from "./draft-generator";
import type {
  CreateGenerationProvider,
  DraftProviderInput,
  RegenerateDraftInput,
  TopicProviderInput,
} from "./provider";
import type { ContentBrief, CreateTopicCandidate } from "./types";

const contentBriefSchema = z.object({
  whatHappened: z.string(),
  concreteDetails: z.array(z.string()),
  personalReaction: z.string().nullable(),
  tension: z.string().nullable(),
  personalJudgment: z.string().nullable(),
  unresolvedQuestion: z.string().nullable(),
  possibleNextStep: z.string().nullable(),
  confirmedFacts: z.array(z.string()),
  unverifiedClaims: z.array(z.string()),
  prohibitedClaims: z.array(z.string()),
  missingContext: z.array(z.string()),
  externalReferences: z.array(z.string()),
});

const topicSchema = z.object({
  key: z.enum(["record", "perspective", "focus"]),
  title: z.string().min(1),
  whyWorthWriting: z.string().min(1),
  recommendedAngle: z.string().min(1),
  platform: z.literal("朋友圈"),
  missingInformation: z.string(),
  sourceBasis: z.string().min(1),
  difference: z.string().min(1),
});

const rawDraftSchema = z.object({
  key: z.enum(["record", "perspective", "concise"]),
  body: z.string().min(1),
});

type FetchLike = typeof fetch;

function jsonPrompt(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export class VolcengineArkCreateProvider implements CreateGenerationProvider {
  id = "volcengine_ark";
  mode = "model" as const;

  constructor(
    private readonly apiKey: string,
    private readonly modelId: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    if (!apiKey.trim() || !modelId.trim()) throw new Error("ARK_API_KEY and ARK_MODEL_ID are required");
  }

  private async requestJson<T>(system: string, user: string, schema: z.ZodType<T>): Promise<T> {
    const response = await this.fetchImpl("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
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
        max_tokens: 2600,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Volcengine Ark request failed with status ${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("Volcengine Ark returned no structured content");
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { throw new Error("Volcengine Ark returned invalid JSON"); }
    return schema.parse(parsed);
  }

  async createBrief(input: Omit<TopicProviderInput, "brief">): Promise<ContentBrief> {
    return this.requestJson(
      "你是事实编辑，不是文案作者。只提取用户明确提供的信息，禁止补写经历、动作、结果、情绪、下一步或成果。外部观点必须单独归属。输出 JSON。",
      `从以下原始输入生成 ContentBrief。数组尽量使用原文短句；没有信息的可空字段返回 null。\n\n来源类型：${input.sourceMode}\n原始输入：${input.sourceText}\n\n字段：whatHappened, concreteDetails, personalReaction, tension, personalJudgment, unresolvedQuestion, possibleNextStep, confirmedFacts, unverifiedClaims, prohibitedClaims, missingContext, externalReferences。`,
      contentBriefSchema,
    );
  }

  async createTopics(input: TopicProviderInput): Promise<CreateTopicCandidate[]> {
    const result = await this.requestJson(
      "你是朋友圈选题编辑。基于同一个 ContentBrief 提出三个内容焦点真正不同的选题。不得只是改标题，不得补事实。输出 JSON 对象 {topics:[...]}。",
      `ContentBrief：${jsonPrompt(input.brief)}\n\n每个选题字段：key(record|perspective|focus)、title、whyWorthWriting、recommendedAngle、platform(固定朋友圈)、missingInformation、sourceBasis、difference。difference 必须说明与另外两条的实质区别。`,
      z.object({ topics: z.array(topicSchema).length(3) }),
    );
    return result.topics;
  }

  async createDrafts(input: DraftProviderInput): Promise<RawCreateDraft[]> {
    const result = await this.requestJson(
      "你是齐鑫朋友圈候选稿编辑。只使用 ContentBrief 中的事实、感受和判断。禁止编造场景、行动、成果、客户反馈或下一步；外部观点必须明确归属。不要模仿任何外部作者，不复制声音样本句子。不要课程腔、报告腔、强行升华或 CTA。输出 JSON 对象 {drafts:[...]}。",
      `选题：${jsonPrompt(input.topic)}\nContentBrief：${jsonPrompt(input.brief)}\n声音结构画像（只有结构统计，没有样本原句）：${jsonPrompt(input.voiceStyle)}\n\n生成三稿：record 从输入中已有的具体动作、时间或变化进入，事情先于判断；perspective 从用户已经表达的判断进入，再用事件支撑；concise 为 2-4 个短段，只留事件、一个已有判断和必要留白。首句、段落节奏和结尾必须不同，不能只是长短版。字段 key 和 body。`,
      z.object({ drafts: z.array(rawDraftSchema).length(3) }),
    );
    return result.drafts;
  }

  async regenerateDraft(input: RegenerateDraftInput): Promise<RawCreateDraft> {
    const result = await this.requestJson(
      "只重写一个结构重复的朋友圈候选稿。保持事实边界，不随机替换同义词，不复制其他稿件，不增加下一步或结论。输出 JSON 对象 {draft:{key,body}}。",
      `需要重写：${input.key}\n质量问题：${input.qualityIssues.join("；")}\nContentBrief：${jsonPrompt(input.brief)}\n已有三稿：${jsonPrompt(input.existingDrafts)}\n要求使用与已有稿不同的开头方式、段落节奏和结尾。`,
      z.object({ draft: rawDraftSchema }),
    );
    return { ...result.draft, key: input.key };
  }
}
