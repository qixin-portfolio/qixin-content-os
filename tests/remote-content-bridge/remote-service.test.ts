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
      return { data: draft("perspective", "我真正担心的不是把范围说清楚，而是每次检索都不能越过它。"), metadata };
    },
    get topicCalls() { return topicCalls; },
    get draftCalls() { return draftCalls; },
    get repairCalls() { return repairCalls; },
    get draftInputs() { return draftInputs; },
  } as CreateGenerationProvider & { topicCalls: number; draftCalls: number; repairCalls: number; draftInputs: unknown[] };
}

const sparseInput = {
  rawInput: "今天在外面出差，没法打开 Content OS，但突然发现微信才应该是我真正的入口。",
  sourceMode: "personal_note" as const,
  sourceMaterials: [],
};

const sparseTopic = {
  key: "record" as const,
  title: "微信才是真入口",
  whyWorthWriting: "来自一次真实使用受限。",
  recommendedAngle: "从出差时打不开工具写起。",
  platform: "朋友圈" as const,
  missingInformation: "",
  sourceBasis: "来自本次原始输入。",
  difference: "记录一次入口判断。",
};

const distinctRecord = "今天在外面出差，没法打开 Content OS。也是到这个时候我才发现，我真正需要的可能不是一个只能在电脑前打开的内容工具，而是一个随时能从微信进入的工作流。";
const distinctPerspective = "一个工具能不能真正进入我的工作流，不只看功能够不够，还要看需要的时候能不能马上用。今天在外面出差没法打开 Content OS，我才发现，对我来说，Content OS 应该把微信放到更前面。";
const correctConcise = "Content OS 的真正入口，不该是网页，而该是微信。";

function sparseDraft(key: RawCreateDraft["key"], body: string): RawCreateDraft {
  return { key, body, usedFacts: [{ claim: body, factIds: ["F1"] }], interpretations: [] };
}

function remoteDraftProvider(initial: RawCreateDraft[], repairs: Partial<Record<RawCreateDraft["key"], RawCreateDraft>> = {}) {
  let repairCalls = 0;
  const repairInputs: unknown[] = [];
  return {
    id: "volcengine_ark",
    mode: "model" as const,
    async createTopics() { return { data: topicEnvelope, metadata }; },
    async createDrafts() { return { data: initial, metadata }; },
    async repairDraft(input: { key: RawCreateDraft["key"] }) {
      repairCalls += 1;
      repairInputs.push(input);
      return { data: repairs[input.key] ?? initial.find((draft) => draft.key === input.key)!, metadata };
    },
    get repairCalls() { return repairCalls; },
    get repairInputs() { return repairInputs; },
  } as CreateGenerationProvider & { repairCalls: number; repairInputs: unknown[] };
}

async function createSparseDrafts(p: ReturnType<typeof remoteDraftProvider>, detailMode: "sparse" | "enriched" = "sparse") {
  return createRemoteDrafts({
    ...sparseInput,
    selectedTopic: sparseTopic,
    factAnswers: [],
    detailMode,
  }, { provider: p, voiceStyleSummary: "", voiceSamples: [] });
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
      draft("record", "Agent 自己扩大检索范围后，我才把检索范围收回来。"),
      { key: "perspective", body: "这是工具使用场景下的认知变化。", usedFacts: [{ claim: "这是工具使用场景下的认知变化", factIds: ["F1"] }], interpretations: [] },
      draft("concise", "先把范围关住，我才发现：后面的工作才能继续。"),
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
    expect(result.drafts).toHaveLength(0);
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

  it("fails closed before topic generation when a request asks to read an unapproved project", async () => {
    const ark = provider();

    await expect(createRemoteTopics({
      rawInput: "我已经有相关项目在做，你可以读取资料看一下。",
      sourceMode: "personal_note",
      sourceMaterials: [],
    }, { provider: ark, voiceStyleSummary: "" })).rejects.toThrow(/没有项目资料读取权限/u);

    expect(ark.topicCalls).toBe(0);
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

    const firstInput = ark.draftInputs[0] as { factLedger: { facts: Array<{ sourceType: string; sourceStatus: string }> }; detailMode: string };
    expect(firstInput.detailMode).toBe("enriched");
    expect(firstInput.factLedger.facts.some((fact) => fact.sourceType === "external_opinion")).toBe(true);
    expect(firstInput.factLedger.facts.some((fact) => fact.sourceStatus === "authorized_radar_source")).toBe(true);
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
    expect(ark.draftInputs[0]).toEqual(expect.objectContaining({
      sparseRealization: expect.objectContaining({
        immutableFacts: expect.arrayContaining(["今天在外面出差", "没法打开 Content OS"]),
        forbiddenAdditions: expect.arrayContaining(["执行公务", "指定系统", "核心连接渠道"]),
      }),
    }));
    expect(result).toEqual(expect.objectContaining({ status: "ok", fallback: false }));
    expect(JSON.stringify(result)).not.toMatch(/prisma|database|publish|FactLedger/i);
  });

  it("rejects missing model configuration before it can call a provider", () => {
    expect(() => createRemoteGenerationProvider({ ARK_API_KEY: "key" } as unknown as NodeJS.ProcessEnv)).toThrow(REMOTE_CONTENT_MODEL);
    expect(() => createRemoteGenerationProvider({ ARK_MODEL_ID: REMOTE_CONTENT_MODEL } as unknown as NodeJS.ProcessEnv)).toThrow(/API Key/u);
  });

  it("hides the old project-access claims when no authorized project source was read", async () => {
    const p = remoteDraftProvider([
      sparseDraft("record", "另外我 codex 已经有相关项目在做了，可以读取资料查看。"),
      sparseDraft("perspective", "且已有 codex 相关项目可参考。"),
      sparseDraft("concise", "codex 有相关项目可看。"),
    ]);

    const result = await createRemoteDrafts({
      rawInput: "我在设计一个装修公司自动报价系统，根据确定的效果图和具体房子数据资料，用 AI 先拆一版报价，人工再核对。",
      sourceMode: "personal_note",
      sourceMaterials: [],
      selectedTopic: sparseTopic,
      factAnswers: ["我已经有相关项目在做。"],
      detailMode: "sparse",
    }, { provider: p, voiceStyleSummary: "", voiceSamples: [] });

    expect(result.drafts).toEqual([]);
    expect(JSON.stringify(result.drafts)).not.toMatch(/读取资料|项目可参考|项目可看/u);
  });

  it("rejects an original record that directly copies the sparse raw input, then repairs it once", async () => {
    const record = sparseDraft("record", sparseInput.rawInput);
    const repaired = sparseDraft("record", "今天在外面出差，没法打开 Content OS。也是到这个时候我才发现，能不能从微信进入，对我来说不是附加问题。");
    const p = remoteDraftProvider([
      record,
      sparseDraft("perspective", "我判断一个工具真正进入工作流，不只看功能多少，还要看需要时能不能马上用。"),
      sparseDraft("concise", "打不开 Content OS 的时候，我才发现：微信不是备选入口。"),
    ], { record: repaired });

    const result = await createSparseDrafts(p);

    expect(p.repairCalls).toBe(1);
    expect(result.drafts.find((draft) => draft.key === "record")).toEqual(expect.objectContaining({ body: repaired.body, status: "已修复" }));
  });

  it("treats mechanically shortened drafts as drafts_too_similar and repairs at most once", async () => {
    const p = remoteDraftProvider([
      sparseDraft("record", "今天在外面出差，没法打开 Content OS。微信才应该是我真正的入口。"),
      sparseDraft("perspective", "今天在外面出差，没法打开 Content OS，微信才应该是我真正的入口。"),
      sparseDraft("concise", "出差没法打开 Content OS，微信才是真入口。"),
    ]);

    const result = await createSparseDrafts(p);

    expect(p.repairCalls).toBe(1);
    expect(result.drafts.length).toBeLessThan(3);
  });

  it("rejects a near-copy record and a label-only judgment after one targeted repair", async () => {
    const p = remoteDraftProvider([
      sparseDraft("record", "今天在外面出差，没法打开 Content OS，突然意识到微信才是我真正的入口。"),
      sparseDraft("perspective", "微信才是我真实的核心办公入口。"),
      sparseDraft("concise", correctConcise),
    ]);

    const result = await createSparseDrafts(p);

    expect(p.repairCalls).toBe(1);
    expect(result.drafts).not.toEqual(expect.arrayContaining([expect.objectContaining({ body: "微信才是我真实的核心办公入口。" })]));
  });

  it("rejects report-style cognitive-change language in the restrained judgment", async () => {
    const repaired = sparseDraft("perspective", "我判断一个工具能不能在需要时马上打开，也决定了它是不是工作流的一部分。今天在外面出差没法打开 Content OS，我才重新看见微信的角色。");
    const p = remoteDraftProvider([
      sparseDraft("record", distinctRecord),
      sparseDraft("perspective", "这是异地办公场景下的工具使用认知变化。"),
      sparseDraft("concise", "打不开 Content OS 的时候，我才发现：微信才是真入口。"),
    ], { perspective: repaired });

    const result = await createSparseDrafts(p);

    expect(p.repairInputs).toHaveLength(1);
    expect(result.drafts.find((draft) => draft.key === "perspective")).toEqual(expect.objectContaining({ body: repaired.body, status: "已修复" }));
  });

  it("keeps sparse drafts as distinct record, judgment, and independently meaningful expression", async () => {
    const p = remoteDraftProvider([
      sparseDraft("record", distinctRecord),
      sparseDraft("perspective", "我判断一个工具能不能在需要时马上打开，也决定了它是不是工作流的一部分。今天在外面出差没法打开 Content OS，我才重新看见微信的角色。"),
      sparseDraft("concise", correctConcise),
    ]);

    const result = await createSparseDrafts(p);
    const bodies = result.drafts.map((draft) => draft.body).join("\n");

    expect(p.repairCalls).toBe(0);
    expect(result.drafts).toHaveLength(3);
    expect(new Set(result.drafts.map((draft) => draft.body))).toHaveLength(3);
    expect(bodies).not.toMatch(/杭州|客户|会议|交通工具/u);
  });

  it("keeps enriched mode and external-opinion attribution on the existing remote path", async () => {
    const p = remoteDraftProvider([
      sparseDraft("record", distinctRecord),
      sparseDraft("perspective", "我判断一个工具能不能在需要时马上打开，也决定了它是不是工作流的一部分。今天在外面出差没法打开 Content OS，我才重新看见微信的角色。"),
      sparseDraft("concise", "出差时打不开 Content OS，我才发现：真正的入口不该是网页，而该是微信。"),
    ]);

    const result = await createSparseDrafts(p, "enriched");

    expect(result).toEqual(expect.objectContaining({ status: "ok", fallback: false }));
    expect(result.drafts).toHaveLength(3);
    expect(p.repairCalls).toBe(0);
  });

  it("rejects repeated travel wording and abstract report language in the original record", async () => {
    const badRecord = "今天外出出差期间，我没法打开 Content OS，却忽然察觉到微信才是我真正的使用入口。这次临时的使用限制，让我对日常高频使用的核心入口有了不一样的感知。";
    const p = remoteDraftProvider([
      sparseDraft("record", badRecord),
      sparseDraft("perspective", distinctPerspective),
      sparseDraft("concise", correctConcise),
    ]);

    const result = await createSparseDrafts(p);

    expect(result.drafts).not.toEqual(expect.arrayContaining([expect.objectContaining({ body: badRecord })]));
  });

  it("hides a repair-style record that replaces the event with a report conclusion", async () => {
    const badRecord = "今天在外头出差，没办法打开 Content OS，忽然发觉微信才是我真正的内容入口。这说明工具的可用性会直接影响我对内容入口的判断。";
    const p = remoteDraftProvider([
      sparseDraft("record", badRecord),
      sparseDraft("perspective", distinctPerspective),
      sparseDraft("concise", correctConcise),
    ]);

    const result = await createSparseDrafts(p);

    expect(p.repairCalls).toBe(1);
    expect(result.drafts).not.toEqual(expect.arrayContaining([expect.objectContaining({ body: badRecord })]));
  });

  it("requires a personal judgment to retain a product or event anchor and rejects abstract synonym pairs", async () => {
    const badPerspective = "我选使用入口的时候，不只看功能能不能满足基础需求，还要看不同场景下的可及性。我判断入口的适配性，不只看它的预设定位，还要看实际使用时的便捷程度。";
    const p = remoteDraftProvider([
      sparseDraft("record", distinctRecord),
      sparseDraft("perspective", badPerspective),
      sparseDraft("concise", correctConcise),
    ]);

    const result = await createSparseDrafts(p);

    expect(result.drafts).not.toEqual(expect.arrayContaining([expect.objectContaining({ body: badPerspective })]));
  });

  it("rejects an inverted system-entry relation and keeps the correct relation", async () => {
    const wrongConcise = "才发现：真正的使用入口不是 Content OS，而是微信。";
    const p = remoteDraftProvider([
      sparseDraft("record", distinctRecord),
      sparseDraft("perspective", distinctPerspective),
      sparseDraft("concise", wrongConcise),
    ], { concise: sparseDraft("concise", correctConcise) });

    const result = await createSparseDrafts(p);

    expect(result.drafts).not.toEqual(expect.arrayContaining([expect.objectContaining({ body: wrongConcise })]));
    expect(result.drafts).toEqual(expect.arrayContaining([expect.objectContaining({ body: correctConcise })]));
  });

  it("rejects an inverted system-entry relation in an original record too", async () => {
    const wrongRecord = "今天在外面出差，没法打开 Content OS。我才发现真正适合我的内容入口不是 Content OS，而是微信。";
    const p = remoteDraftProvider([
      sparseDraft("record", wrongRecord),
      sparseDraft("perspective", distinctPerspective),
      sparseDraft("concise", correctConcise),
    ], { record: sparseDraft("record", distinctRecord) });

    const result = await createSparseDrafts(p);

    expect(p.repairCalls).toBe(1);
    expect(result.drafts).not.toEqual(expect.arrayContaining([expect.objectContaining({ body: wrongRecord })]));
    expect(result.drafts).toEqual(expect.arrayContaining([expect.objectContaining({ body: distinctRecord, status: "已修复" })]));
  });

  it("returns one visible draft when the other sparse drafts still fail after the single repair", async () => {
    const p = remoteDraftProvider([
      sparseDraft("record", "今天外出出差期间，临时的使用限制让我有了不一样的感知。"),
      sparseDraft("perspective", "我判断工具选择不只看基础需求，还要看可及性和适配性。"),
      sparseDraft("concise", correctConcise),
    ]);

    const result = await createSparseDrafts(p);

    expect(p.repairCalls).toBe(1);
    expect(result.drafts).toEqual([expect.objectContaining({ key: "concise", body: correctConcise, status: "通过" })]);
  });

  it("hides the failed Weixin record and judgment while preserving the usable concise draft", async () => {
    const badRecord = "今天外出执行公务时，我没办法打开 Content OS，却忽然察觉微信是 Content OS 的核心连接渠道。这种临时无法访问指定系统的状况，让我直观感知到办公场景里工具适配的关键作用。";
    const badPerspective = "我不只看能不能打开 Content OS 本身，还要看有没有能访问它的便捷路径。我不只看工具的官方设定，还要看实际能用的操作方式。";
    const usableConcise = "Content OS 真正的入口，应该是微信。";
    const p = remoteDraftProvider([
      sparseDraft("record", badRecord),
      sparseDraft("perspective", badPerspective),
      sparseDraft("concise", usableConcise),
    ]);

    const result = await createSparseDrafts(p);

    expect(p.repairCalls).toBe(1);
    expect(result.drafts).toEqual([expect.objectContaining({
      key: "concise",
      body: usableConcise,
      status: "通过",
    })]);
  });
});
