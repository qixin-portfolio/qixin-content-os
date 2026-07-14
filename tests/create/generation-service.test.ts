import { describe, expect, it } from "vitest";
import { generateDraftPackage } from "../../src/lib/create/generation-service";
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
  return {
    id: "test-model",
    mode: "model" as const,
    async createDrafts() { return drafts; },
    async regenerateDraft(input: { key: "record" | "perspective" | "concise" }) { calls.push(input.key); return { key: input.key, body: regeneratedBody }; },
    calls,
  };
}

describe("generation orchestration", () => {
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
        return [
          { key: "record" as const, body: input.brief.concreteDetails.join("。\n\n") },
          { key: "perspective" as const, body: input.brief.confirmedFacts.join("。\n\n") },
          { key: "concise" as const, body: input.brief.whatHappened },
        ];
      },
      async regenerateDraft(input: { key: "record" | "perspective" | "concise" }) {
        return { key: input.key, body: sourceText };
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
