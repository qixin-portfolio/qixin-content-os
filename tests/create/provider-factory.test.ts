import { describe, expect, it, vi } from "vitest";
import { createGenerationProvider } from "../../src/lib/create/provider-factory";
import {
  ARK_PROVIDER_TIMEOUT_MS,
  VolcengineArkCreateProvider,
} from "../../src/lib/create/volcengine-ark-provider";

const validBrief = {
  whatHappened: "今天打开系统",
  concreteDetails: ["今天打开系统"],
  personalReaction: null,
  tension: null,
  personalJudgment: null,
  unresolvedQuestion: null,
  possibleNextStep: null,
  confirmedFacts: ["今天打开系统"],
  unverifiedClaims: [],
  prohibitedClaims: [],
  missingContext: [],
  externalReferences: [],
};

const validTopicEnvelope = {
  brief: {
    whatHappened: "今天打开系统",
    concreteDetails: ["今天打开系统"],
    personalReaction: "",
    tension: "",
    personalJudgment: "",
    unresolvedQuestion: "",
    possibleNextStep: "",
    confirmedFacts: ["今天打开系统"],
    unverifiedClaims: [],
    prohibitedClaims: [],
    missingContext: [],
  },
  topics: [
    { title: "记录发生的事", focus: "具体变化", whyWorthWriting: "事情真实", angle: "从事情开始", platform: "wechat_moments", missingInformation: [], sourceGrounding: ["今天打开系统"] },
    { title: "写判断变化", focus: "个人判断", whyWorthWriting: "判断来自经历", angle: "从判断开始", platform: "wechat_moments", missingInformation: [], sourceGrounding: ["今天打开系统"] },
    { title: "保留未完成", focus: "克制留白", whyWorthWriting: "不强行总结", angle: "只留事实", platform: "wechat_moments", missingInformation: [], sourceGrounding: ["今天打开系统"] },
  ],
};

const validDraftEnvelope = {
  drafts: [
    { type: "scene_record", content: "今天打开系统。", approachDescription: "从事情开始", groundedFacts: ["今天打开系统"], unresolvedClaims: [] },
    { type: "thought_progression", content: "它开始像一个能用的系统。", approachDescription: "从判断开始", groundedFacts: [], unresolvedClaims: ["是否真的能长期使用"] },
    { type: "restrained_short", content: "今天又打开了它。", approachDescription: "只留必要事实", groundedFacts: ["今天打开系统"], unresolvedClaims: [] },
  ],
};

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] }), { status: 200 });
}

function delayedBriefFetch(delayMs: number) {
  return vi.fn<typeof fetch>((_input, init) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve(jsonResponse(validTopicEnvelope));
    }, delayMs);
    init?.signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(init.signal?.reason ?? new DOMException("Aborted", "AbortError"));
    }, { once: true });
  }));
}

describe("Volcengine Ark provider selection", () => {
  it("rejects missing Ark configuration instead of silently selecting fallback", () => {
    const environment = (values: Record<string, string>) => ({ NODE_ENV: "test", ...values }) as unknown as NodeJS.ProcessEnv;
    expect(() => createGenerationProvider(environment({}))).toThrow(expect.objectContaining({ code: "api_key_missing" }));
    expect(() => createGenerationProvider(environment({ ARK_API_KEY: "key-only" })))
      .toThrow(expect.objectContaining({ code: "model_id_missing" }));
    expect(createGenerationProvider(environment({ ARK_API_KEY: "key", ARK_MODEL_ID: "ep-real-id" })).id).toBe("volcengine_ark");
  });

  it("sends the configured endpoint ID to the official Chat API using mock fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return jsonResponse(validTopicEnvelope);
    });
    const provider = new VolcengineArkCreateProvider("test-server-key", "ep-real-id", fetchMock as typeof fetch);

    await provider.createTopicEnvelope({ sourceMode: "manual", sourceText: "今天打开系统", platform: "wechat_moments" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://ark.cn-beijing.volces.com/api/v3/chat/completions");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("ep-real-id");
    expect(body.model).not.toBe("doubao-2.1");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer test-server-key");
  });

  it("uses a 120 second default timeout and accepts a response inside the configured window", async () => {
    expect(ARK_PROVIDER_TIMEOUT_MS).toBe(120_000);
    const provider = new VolcengineArkCreateProvider("test-server-key", "model-id", delayedBriefFetch(20), 80);

    await expect(provider.createTopicEnvelope({ sourceMode: "manual", sourceText: "今天打开系统", platform: "wechat_moments" }))
      .resolves.toEqual(expect.objectContaining({ data: validTopicEnvelope }));
  });

  it("classifies the legacy-short and over-limit windows as timeout", async () => {
    const legacyShort = new VolcengineArkCreateProvider("test-server-key", "model-id", delayedBriefFetch(40), 20);
    const overLimit = new VolcengineArkCreateProvider("test-server-key", "model-id", delayedBriefFetch(30), 10);

    await expect(legacyShort.createTopicEnvelope({ sourceMode: "manual", sourceText: "今天打开系统", platform: "wechat_moments" }))
      .rejects.toMatchObject({ code: "timeout" });
    await expect(overLimit.createTopicEnvelope({ sourceMode: "manual", sourceText: "今天打开系统", platform: "wechat_moments" }))
      .rejects.toMatchObject({ code: "timeout" });
  });

  it("returns brief and exactly three topics from one json_object request", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(validTopicEnvelope));
    const provider = new VolcengineArkCreateProvider("test-server-key", "model-id", fetchMock);

    const result = await provider.createTopicEnvelope({
      sourceMode: "manual",
      sourceText: "今天打开系统",
      platform: "wechat_moments",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.data.topics).toHaveLength(3);
    expect(result.metadata.repairCount).toBe(0);
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.response_format).toEqual({ type: "json_object" });
    expect(request.max_tokens).toBe(1_000);
  });

  it("repairs malformed structured output once without silently accepting it", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ brief: { whatHappened: "今天打开系统" }, topics: [] }))
      .mockResolvedValueOnce(jsonResponse(validTopicEnvelope));
    const provider = new VolcengineArkCreateProvider("test-server-key", "model-id", fetchMock);

    const result = await provider.createTopicEnvelope({ sourceMode: "manual", sourceText: "今天打开系统", platform: "wechat_moments" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.metadata.repairCount).toBe(1);
    expect(result.data.topics).toHaveLength(3);
  });

  it("returns schema_validation_failed after one unsuccessful repair", async () => {
    const malformed = jsonResponse({ brief: { whatHappened: "今天打开系统" }, topics: [] });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(malformed).mockResolvedValueOnce(jsonResponse({ topics: [] }));
    const provider = new VolcengineArkCreateProvider("test-server-key", "model-id", fetchMock);

    await expect(provider.createTopicEnvelope({ sourceMode: "manual", sourceText: "今天打开系统", platform: "wechat_moments" }))
      .rejects.toMatchObject({ code: "schema_validation_failed" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns three draft types from one request without sample text in the request", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(validDraftEnvelope));
    const provider = new VolcengineArkCreateProvider("test-server-key", "model-id", fetchMock);
    const privateSample = "PRIVATE VOICE SAMPLE BODY";

    const result = await provider.createDrafts({
      sourceMode: "manual",
      sourceText: "今天打开系统",
      brief: validBrief,
      topic: {
        key: "record",
        title: "记录发生的事",
        whyWorthWriting: "事情真实",
        recommendedAngle: "从事情开始",
        platform: "朋友圈",
        missingInformation: "",
        sourceBasis: "今天打开系统",
        difference: "具体变化",
      },
      voiceStyle: {
        sampleCount: 1,
        averageParagraphs: 2,
        averageParagraphLength: 20,
        openingModes: ["scene"],
        judgmentPosition: "late",
        openEndingPreference: 0,
        uncertaintyPreference: 0,
        selfDeprecationPreference: 0,
        emotionIntensity: "low",
        principles: ["具体"],
      },
      privateSample,
    } as never);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.data.map((draft) => draft.key)).toEqual(["record", "perspective", "concise"]);
    expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain(privateSample);
  });
});
