import { describe, expect, it } from "vitest";
import { generateDraftPackage, generateTopicPackage, withProviderFallback } from "../../src/lib/create/generation-service";
import { CreateProviderError } from "../../src/lib/create/provider";
import type { ContentBrief, CreateTopicCandidate } from "../../src/lib/create/types";

const brief: ContentBrief = {
  whatHappened: "昨天带宝宝出门，最后一张照片也没拍。",
  concreteDetails: ["昨天带宝宝出门", "一直抱着他", "一张也没拍"],
  personalReaction: "原本想拍很多照片",
  tension: "原本想拍很多照片，最后一张也没拍",
  personalJudgment: null,
  unresolvedQuestion: null,
  possibleNextStep: null,
  confirmedFacts: ["昨天带宝宝出门", "一直抱着他", "一张也没拍"],
  unverifiedClaims: [],
  prohibitedClaims: [],
  missingContext: [],
  externalReferences: [],
};

const topic: CreateTopicCandidate = {
  key: "record",
  title: "想记录的时候，最后什么也没拍",
  whyWorthWriting: "重点是一个具体生活落差。",
  recommendedAngle: "保留出门、抱着宝宝和空相册。",
  platform: "朋友圈",
  missingInformation: "没有缺少发布所必需的信息。",
  sourceBasis: "来自用户输入中的出门、抱宝宝和没拍照片。",
  difference: "这一条只写现场，不延伸成育儿道理。",
};

function providerWithDrafts(drafts: Array<{ key: "record" | "perspective" | "concise"; body: string }>, regeneratedBody: string) {
  const calls: string[] = [];
  const metadata = { model: "test-model", durationMs: 1, repairCount: 0, responseFormat: "json_object" as const };
  return {
    id: "test-model",
    mode: "model" as const,
    async createDrafts() { return { data: drafts, metadata }; },
    async regenerateDraft(input: { key: "record" | "perspective" | "concise" }) {
      calls.push(input.key);
      return { data: { key: input.key, body: regeneratedBody }, metadata };
    },
    calls,
  };
}

describe("generation orchestration", () => {
  it("gets brief and topics from one provider call and constrains model facts to source text", async () => {
    let calls = 0;
    const provider = {
      id: "volcengine_ark",
      mode: "model" as const,
      async createTopicEnvelope() {
        calls += 1;
        return {
          data: {
            brief: {
              whatHappened: "今天重新打开 Content OS",
              concreteDetails: ["今天重新打开 Content OS", "三个客户已经认可"],
              personalReaction: "",
              tension: "",
              personalJudgment: "",
              unresolvedQuestion: "",
              possibleNextStep: "明天正式上线",
              confirmedFacts: ["今天重新打开 Content OS", "三个客户已经认可"],
              unverifiedClaims: [],
              prohibitedClaims: [],
              missingContext: [],
            },
            topics: [
              { title: "记录变化", focus: "只写事情", whyWorthWriting: "有变化", angle: "事情在前", platform: "wechat_moments" as const, missingInformation: [], sourceGrounding: ["今天重新打开 Content OS"] },
              { title: "判断变化", focus: "只写判断", whyWorthWriting: "有判断", angle: "判断在前", platform: "wechat_moments" as const, missingInformation: [], sourceGrounding: [] },
              { title: "克制留白", focus: "只写未完成", whyWorthWriting: "不总结", angle: "保留留白", platform: "wechat_moments" as const, missingInformation: [], sourceGrounding: [] },
            ],
          },
          metadata: { model: "model-id", durationMs: 2_000, repairCount: 0, responseFormat: "json_object" as const },
        };
      },
    } as never;

    const result = await generateTopicPackage({
      provider,
      sourceMode: "manual",
      sourceText: "今天重新打开 Content OS，终于感觉它像一个我会用的产品了。",
      platform: "wechat_moments",
    });

    expect(calls).toBe(1);
    expect(result.topics).toHaveLength(3);
    expect(JSON.stringify(result.brief)).not.toMatch(/客户|明天正式上线/);
    expect(result.generation).toEqual(expect.objectContaining({
      generationMode: "volcengine_ark",
      provider: "volcengine_ark",
      model: "model-id",
      fallback: false,
      repairCount: 0,
      responseFormat: "json_object",
    }));
  });

  it("does not enter fallback for strict mode or provider timeout", async () => {
    const calls: string[] = [];
    const provider = {
      id: "volcengine_ark",
      mode: "model" as const,
    } as never;
    const operation = async (activeProvider: { id: string }) => {
      calls.push(activeProvider.id);
      if (activeProvider.id === "volcengine_ark") throw new CreateProviderError("timeout", "火山方舟响应超时，请稍后重试。");
      return "fallback";
    };

    await expect(withProviderFallback(provider, operation, { allowFallback: false })).rejects.toMatchObject({ code: "timeout" });
    expect(calls).toEqual(["volcengine_ark"]);

    calls.length = 0;
    await expect(withProviderFallback(provider, operation)).rejects.toMatchObject({ code: "timeout" });
    expect(calls).toEqual(["volcengine_ark"]);
  });

  it("does not fallback on schema failure unless the user explicitly allows local demo", async () => {
    const calls: string[] = [];
    const provider = { id: "volcengine_ark", mode: "model" as const } as never;
    const operation = async (activeProvider: { id: string }) => {
      calls.push(activeProvider.id);
      if (activeProvider.id === "volcengine_ark") {
        throw new CreateProviderError("schema_validation_failed", "真实模型返回格式不完整，请重试。");
      }
      return "local-demo";
    };

    await expect(withProviderFallback(provider, operation)).rejects.toMatchObject({ code: "schema_validation_failed" });
    expect(calls).toEqual(["volcengine_ark"]);

    calls.length = 0;
    await expect(withProviderFallback(provider, operation, { allowFallback: true })).resolves.toBe("local-demo");
    expect(calls).toEqual(["volcengine_ark", "deterministic_fallback"]);
  });

  it("removes client-supplied brief facts that are absent from the original input", async () => {
    const sourceText = "今天重新打开 Content OS，终于感觉它像一个我会用的产品了。";
    const tamperedBrief: ContentBrief = {
      ...brief,
      whatHappened: sourceText,
      concreteDetails: ["今天重新打开 Content OS", "已经得到客户认可"],
      confirmedFacts: ["今天重新打开 Content OS", "已经得到客户认可"],
    };
    const provider = {
      id: "echo-brief",
      mode: "model" as const,
      async createDrafts(input: { brief: ContentBrief }) {
        return {
          data: [
            { key: "record" as const, body: input.brief.concreteDetails.join("。\n\n"), groundedFacts: ["已经得到客户认可"] },
            { key: "perspective" as const, body: input.brief.confirmedFacts.join("。\n\n") },
            { key: "concise" as const, body: input.brief.whatHappened },
          ],
          metadata: { model: "echo", durationMs: 1, repairCount: 0, responseFormat: "json_object" as const },
        };
      },
      async regenerateDraft(input: { key: "record" | "perspective" | "concise" }) {
        return {
          data: { key: input.key, body: sourceText },
          metadata: { model: "echo", durationMs: 1, repairCount: 0, responseFormat: "json_object" as const },
        };
      },
    };

    const result = await generateDraftPackage({
      provider,
      brief: tamperedBrief,
      topic,
      sourceMode: "manual",
      sourceText,
      voiceStyle: null,
      voiceSamples: [],
    });

    expect(result.drafts.map((draft) => draft.body).join("\n")).not.toContain("客户认可");
    expect(JSON.stringify(result.drafts)).not.toContain("客户认可");
  });

  it("regenerates only similar variants once", async () => {
    const provider = providerWithDrafts([
      { key: "record", body: "昨天带宝宝出门。\n\n最后一张也没拍。" },
      { key: "perspective", body: "昨天带宝宝出门。\n\n最后一张也没拍。" },
      { key: "concise", body: "昨天带宝宝出门。\n\n最后一张也没拍。" },
    ], "想拍很多照片。\n\n一路都在抱着他。\n\n相册是空的。");

    const result = await generateDraftPackage({ provider, brief, topic, sourceMode: "manual", sourceText: brief.whatHappened, voiceStyle: null, voiceSamples: [] });

    expect(provider.calls.length).toBeGreaterThan(0);
    expect(new Set(provider.calls).size).toBe(provider.calls.length);
    expect(result.retryCount).toBe(1);
  });

  it("returns an explicit insufficient status when one retry is still similar", async () => {
    const repeated = "昨天带宝宝出门。\n\n最后一张也没拍。";
    const provider = providerWithDrafts([
      { key: "record", body: repeated },
      { key: "perspective", body: repeated },
      { key: "concise", body: repeated },
    ], repeated);

    const result = await generateDraftPackage({ provider, brief, topic, sourceMode: "manual", sourceText: brief.whatHappened, voiceStyle: null, voiceSamples: [] });

    expect(result.qualityStatus).toBe("insufficient");
    expect(result.qualityMessage).toBe("三个版本仍然过于相似，请保留当前人工稿并稍后重试。");
    expect(result.retryCount).toBe(1);
  });
});
