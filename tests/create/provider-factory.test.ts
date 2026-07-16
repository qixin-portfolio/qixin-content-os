import { describe, expect, it, vi } from "vitest";
import { createGenerationProvider } from "../../src/lib/create/provider-factory";
import { createGroundingContext } from "../../src/lib/create/grounding-context";
import { createFactLedger } from "../../src/lib/create/fact-ledger";
import {
  ARK_PROVIDER_TIMEOUT_MS,
  DRAFT_PROMPT_BUDGET,
  TOPIC_PROMPT_BUDGET,
  VolcengineArkCreateProvider,
} from "../../src/lib/create/volcengine-ark-provider";

const groundingContext = createGroundingContext({
  rawInput: "今天打开系统",
  sourceMode: "manual",
  platform: "wechat_moments",
});

const topic = {
  key: "record" as const,
  title: "记录发生的事",
  whyWorthWriting: "事情真实",
  recommendedAngle: "从事情开始",
  platform: "朋友圈" as const,
  missingInformation: "",
  sourceBasis: "今天打开系统",
  difference: "具体变化",
};
const factLedger = createFactLedger({ rawInput: "今天打开系统", factAnswers: [], sourceMode: "manual" });

const validTopicEnvelope = {
  topics: [
    { title: "记录发生的事", focus: "具体变化", whyWorthWriting: "事情真实", angle: "从事情开始", missingInformation: [], sourceGrounding: ["今天打开系统"] },
    { title: "写判断变化", focus: "个人判断", whyWorthWriting: "判断来自经历", angle: "从判断开始", missingInformation: [], sourceGrounding: ["今天打开系统"] },
    { title: "保留未完成", focus: "克制留白", whyWorthWriting: "不强行总结", angle: "只留事实", missingInformation: [], sourceGrounding: ["今天打开系统"] },
  ],
};

const validDraftEnvelope = {
  drafts: [
    { type: "original_record", content: "今天打开系统。", approachDescription: "从事情开始", usedFacts: [{ claim: "今天打开系统", factIds: ["F1"] }], interpretations: [] },
    { type: "restrained_judgment", content: "系统打开后，重点还是要清楚。", approachDescription: "从判断开始", usedFacts: [{ claim: "今天打开系统", factIds: ["F1"] }], interpretations: [{ text: "工具清楚更重要", basisFactIds: ["F1"] }] },
    { type: "minimal_expression", content: "今天，又打开了它。", approachDescription: "只留必要事实", usedFacts: [{ claim: "今天打开系统", factIds: ["F1"] }], interpretations: [] },
  ],
};

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] }), { status: 200 });
}

function delayedTopicsFetch(delayMs: number) {
  return vi.fn<typeof fetch>((_input, init) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(jsonResponse(validTopicEnvelope)), delayMs);
    init?.signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(init.signal?.reason ?? new DOMException("Aborted", "AbortError"));
    }, { once: true });
  }));
}

describe("Volcengine Ark minimal provider", () => {
  it("rejects missing Ark configuration instead of silently selecting fallback", () => {
    const environment = (values: Record<string, string>) => ({ NODE_ENV: "test", ...values }) as unknown as NodeJS.ProcessEnv;
    expect(() => createGenerationProvider(environment({}))).toThrow(expect.objectContaining({ code: "api_key_missing" }));
    expect(() => createGenerationProvider(environment({ ARK_API_KEY: "key-only" })))
      .toThrow(expect.objectContaining({ code: "model_id_missing" }));
    expect(createGenerationProvider(environment({ ARK_API_KEY: "key", ARK_MODEL_ID: "ep-real-id" })).id).toBe("volcengine_ark");
  });

  it("uses a 60 second provider ceiling without increasing the old timeout", () => {
    expect(ARK_PROVIDER_TIMEOUT_MS).toBe(60_000);
  });

  it("sends one topics-only json_object request to the configured Chat API", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(validTopicEnvelope));
    const provider = new VolcengineArkCreateProvider("test-server-key", "ep-real-id", fetchMock);

    const result = await provider.createTopics({ groundingContext, voiceStyleSummary: "短段落，先事实后判断。" });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.data.topics).toHaveLength(3);
    expect("brief" in result.data).toBe(false);
    const [url, init] = fetchMock.mock.calls[0];
    const request = JSON.parse(String(init?.body));
    expect(String(url)).toBe("https://ark.cn-beijing.volces.com/api/v3/chat/completions");
    expect(request.model).toBe("ep-real-id");
    expect(request.response_format).toEqual({ type: "json_object" });
    expect(request.stream).toBe(false);
    expect(request.max_tokens).toBeLessThanOrEqual(700);
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer test-server-key");
  });

  it("keeps topic and draft prompts inside budgets without sending sample bodies", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(validTopicEnvelope))
      .mockResolvedValueOnce(jsonResponse(validDraftEnvelope));
    const provider = new VolcengineArkCreateProvider("test-server-key", "model-id", fetchMock);
    const privateSample = "PRIVATE VOICE SAMPLE BODY";
    const privateTitle = "PRIVATE SAMPLE TITLE";
    const oversizedSummary = `${"短段落，少解释。".repeat(100)}${privateSample}${privateTitle}`;

    const topics = await provider.createTopics({ groundingContext, voiceStyleSummary: oversizedSummary });
    const drafts = await provider.createDrafts({ groundingContext, topic, voiceStyleSummary: oversizedSummary, factLedger, detailMode: "sparse" });

    expect(TOPIC_PROMPT_BUDGET).toBe(4_000);
    expect(DRAFT_PROMPT_BUDGET).toBe(6_000);
    expect(topics.metadata.promptCharacters).toBeLessThanOrEqual(TOPIC_PROMPT_BUDGET);
    expect(drafts.metadata.promptCharacters).toBeLessThanOrEqual(DRAFT_PROMPT_BUDGET);
    for (const call of fetchMock.mock.calls) {
      const body = String(call[1]?.body);
      expect(body).not.toContain(privateSample);
      expect(body).not.toContain(privateTitle);
    }
  });

  it("never truncates raw input and records prompt_budget_exceeded when facts alone exceed budget", async () => {
    const rawInput = `${"真实过程不能裁剪。".repeat(700)}最后一句必须保留。`;
    const context = createGroundingContext({ rawInput, sourceMode: "manual", platform: "wechat_moments" });
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(validTopicEnvelope));
    const provider = new VolcengineArkCreateProvider("test-server-key", "model-id", fetchMock);

    const result = await provider.createTopics({ groundingContext: context, voiceStyleSummary: "不重要的风格信息" });
    const body = String(fetchMock.mock.calls[0][1]?.body);

    expect(body).toContain(rawInput);
    expect(body).toContain("最后一句必须保留");
    expect(result.metadata.promptBudgetExceeded).toBe(true);
  });

  it("repairs malformed topics once and rejects a second schema failure", async () => {
    const repairedFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ topics: [] }))
      .mockResolvedValueOnce(jsonResponse(validTopicEnvelope));
    const repaired = await new VolcengineArkCreateProvider("key", "model", repairedFetch)
      .createTopics({ groundingContext, voiceStyleSummary: "" });
    expect(repairedFetch).toHaveBeenCalledTimes(2);
    expect(repaired.metadata.repairCount).toBe(1);

    const failedFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ topics: [] }))
      .mockResolvedValueOnce(jsonResponse({ topics: [] }));
    await expect(new VolcengineArkCreateProvider("key", "model", failedFetch)
      .createTopics({ groundingContext, voiceStyleSummary: "" }))
      .rejects.toMatchObject({ code: "schema_validation_failed" });
  });

  it("classifies a request beyond the configured ceiling as timeout", async () => {
    const provider = new VolcengineArkCreateProvider("key", "model", delayedTopicsFetch(40), 20);
    await expect(provider.createTopics({ groundingContext, voiceStyleSummary: "" }))
      .rejects.toMatchObject({ code: "timeout" });
  });

  it("classifies an unrecognized provider failure without fallback", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("{}", { status: 500 }));
    const provider = new VolcengineArkCreateProvider("key", "model", fetchMock);

    await expect(provider.createTopics({ groundingContext, voiceStyleSummary: "" }))
      .rejects.toMatchObject({ code: "provider_error" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns all three draft types from one initial request", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(validDraftEnvelope));
    const provider = new VolcengineArkCreateProvider("key", "model", fetchMock);

    const result = await provider.createDrafts({ groundingContext, topic, voiceStyleSummary: "短段落", factLedger, detailMode: "sparse" });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.data.map((draft) => draft.key)).toEqual(["record", "perspective", "concise"]);
  });
});
