import { describe, expect, it } from "vitest";
import {
  REMOTE_CONTENT_MODEL,
  createRemoteDrafts,
  createRemoteGenerationProvider,
  createRemoteTopics,
  prepareRemoteSource,
} from "../../src/lib/remote-content-bridge/service";
import type { CreateGenerationProvider } from "../../src/lib/create/provider";
import type { RawCreateDraft } from "../../src/lib/create/draft-generator";

const material = {
  sourceId: "SRC-123456789abc",
  title: "GEO 外部观点",
  author: "外部作者",
  sourceUrl: "https://x.com/example/status/1",
  excerpt: "GEO 会改变品牌被搜索和理解的路径。",
};

const topicEnvelope = {
  topics: [
    { title: "记录边界", focus: "事实优先", whyWorthWriting: "有实际过程", angle: "从具体问题写起", missingInformation: ["当时怎么发现"], sourceGrounding: ["Agent 自己扩大检索范围"] },
    { title: "写路由", focus: "安全边界", whyWorthWriting: "有判断", angle: "从限制写起", missingInformation: [], sourceGrounding: ["Agent 自己扩大检索范围"] },
    { title: "保留未完成", focus: "不夸大", whyWorthWriting: "真实", angle: "不包装结果", missingInformation: [], sourceGrounding: ["Agent 自己扩大检索范围"] },
  ],
};

const metadata = {
  model: "doubao-seed-character-260628",
  durationMs: 1,
  repairCount: 0,
  responseFormat: "json_object" as const,
  promptCharacters: 20,
  promptBudgetExceeded: false,
};

function draft(key: RawCreateDraft["key"], body: string): RawCreateDraft {
  return { key, body, usedFacts: [{ claim: body, factIds: ["F1"] }], interpretations: [] };
}

function provider(initialDrafts: RawCreateDraft[] = [
  draft("record", "Agent 自己扩大检索范围。"),
  draft("perspective", "真正麻烦的是边界。"),
  draft("concise", "先把范围关住。"),
]) {
  let topicCalls = 0;
  let draftCalls = 0;
  let repairCalls = 0;
  const draftInputs: unknown[] = [];
  return {
    id: "volcengine_ark",
    mode: "model" as const,
    async createTopics() {
      topicCalls += 1;
      return { data: topicEnvelope, metadata };
    },
    async createDrafts(input: Parameters<CreateGenerationProvider["createDrafts"]>[0]) {
      draftCalls += 1;
      draftInputs.push(input);
      return {
        data: initialDrafts,
        metadata,
      };
    },
    async repairDraft() {
      repairCalls += 1;
      return { data: draft("perspective", "真正麻烦的是边界。"), metadata };
    },
    get topicCalls() { return topicCalls; },
    get draftCalls() { return draftCalls; },
    get repairCalls() { return repairCalls; },
    get draftInputs() { return draftInputs; },
  } as CreateGenerationProvider & { topicCalls: number; draftCalls: number; repairCalls: number; draftInputs: unknown[] };
}

describe("remote Content OS bridge service", () => {
  it("uses the frozen topic generator exactly once and exposes no internal prompt or ledger fields", async () => {
    const ark = provider();
    const result = await createRemoteTopics({
      rawInput: "最近给 Hermes 接 Obsidian 内容雷达，真正麻烦的不是搜索，而是防止 Agent 自己扩大检索范围。",
      sourceMode: "personal_note",
      sourceMaterials: [],
    }, { provider: ark, voiceStyleSummary: "短段落" });

    expect(ark.topicCalls).toBe(1);
    expect(result).toEqual(expect.objectContaining({ status: "ok", provider: "volcengine_ark", model: "doubao-seed-character-260628", fallback: false }));
    expect(result.topics).toHaveLength(3);
    expect(JSON.stringify(result)).not.toMatch(/FactLedger|factIds|promptCharacters|ARK_API_KEY/i);
  });

  it("uses one initial draft call, allows one directed repair, and returns only acceptable draft fields", async () => {
    const ark = provider([
      draft("record", "Agent 自己扩大检索范围。"),
      { key: "perspective", body: "在杭州办公室手酸。", usedFacts: [], interpretations: [] },
      draft("concise", "先把范围关住。"),
    ]);
    const topics = await createRemoteTopics({ rawInput: "Agent 自己扩大检索范围。", sourceMode: "personal_note", sourceMaterials: [] }, { provider: ark, voiceStyleSummary: "" });
    const result = await createRemoteDrafts({
      rawInput: "Agent 自己扩大检索范围。",
      sourceMode: "personal_note",
      sourceMaterials: [],
      selectedTopic: topics.topics[0],
      factAnswers: [],
      detailMode: "sparse",
    }, { provider: ark, voiceStyleSummary: "", voiceSamples: [] });

    expect(ark.draftCalls).toBe(1);
    expect(ark.repairCalls).toBe(1);
    expect(result.drafts).toHaveLength(3);
    expect(result.drafts.every((item) => ["body", "key", "status"].every((key) => key in item))).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/FactLedger|factIds|usedFacts|rejectedReasons/i);
  });

  it("fails closed without a provider and never chooses a fallback", async () => {
    await expect(createRemoteTopics({ rawInput: "一件真实的事。", sourceMode: "personal_note", sourceMaterials: [] }, {
      provider: { id: "deterministic_fallback", mode: "deterministic_fallback" } as CreateGenerationProvider,
      voiceStyleSummary: "",
    })).rejects.toThrow(/真实模型/u);
  });

  it("marks authorized radar material as an external opinion and rejects local paths", () => {
    const external = prepareRemoteSource({ rawInput: "基于这条素材", sourceMode: "external_material", sourceMaterials: [material] });
    expect(external.createSourceMode).toBe("external_material");
    expect(external.sourceText).toContain("GEO 会改变品牌被搜索和理解的路径");
    expect(() => prepareRemoteSource({ rawInput: "/Users/qixin/private.md", sourceMode: "personal_note", sourceMaterials: [] })).toThrow(/本机路径/u);
    expect(() => prepareRemoteSource({ rawInput: "正常输入", sourceMode: "external_material", sourceMaterials: [{ ...material, relativePath: "笔记同步助手/x.md" }] as never })).toThrow(/来源材料/u);
  });

  it("keeps external radar material attributed through the existing fact ledger", async () => {
    const ark = provider();
    const topics = await createRemoteTopics({ rawInput: "基于这条素材", sourceMode: "external_material", sourceMaterials: [material] }, { provider: ark, voiceStyleSummary: "" });
    await createRemoteDrafts({
      rawInput: "基于这条素材",
      sourceMode: "external_material",
      sourceMaterials: [material],
      selectedTopic: topics.topics[0],
      factAnswers: ["我还没有自己的结论。"],
      detailMode: "enriched",
    }, { provider: ark, voiceStyleSummary: "", voiceSamples: [] });

    const firstInput = ark.draftInputs[0] as { factLedger: { facts: Array<{ sourceType: string }> }; detailMode: string };
    expect(firstInput.detailMode).toBe("enriched");
    expect(firstInput.factLedger.facts.some((fact) => fact.sourceType === "external_opinion")).toBe(true);
  });

  it("preserves sparse mode and never writes a draft package to Content OS storage", async () => {
    const ark = provider();
    const topics = await createRemoteTopics({ rawInput: "今天在外面出差，没法打开 Content OS。", sourceMode: "personal_note", sourceMaterials: [] }, { provider: ark, voiceStyleSummary: "" });
    const result = await createRemoteDrafts({
      rawInput: "今天在外面出差，没法打开 Content OS。",
      sourceMode: "personal_note",
      sourceMaterials: [],
      selectedTopic: topics.topics[1],
      factAnswers: [],
      detailMode: "sparse",
    }, { provider: ark, voiceStyleSummary: "", voiceSamples: [] });

    expect((ark.draftInputs[0] as { detailMode: string }).detailMode).toBe("sparse");
    expect(result).toEqual(expect.objectContaining({ status: "ok", fallback: false }));
    expect(JSON.stringify(result)).not.toMatch(/prisma|database|publish|FactLedger/i);
  });

  it("rejects missing model configuration before it can call a provider", () => {
    expect(() => createRemoteGenerationProvider({ ARK_API_KEY: "key" } as unknown as NodeJS.ProcessEnv)).toThrow(REMOTE_CONTENT_MODEL);
    expect(() => createRemoteGenerationProvider({ ARK_MODEL_ID: REMOTE_CONTENT_MODEL } as unknown as NodeJS.ProcessEnv)).toThrow(/API Key/u);
  });
});
