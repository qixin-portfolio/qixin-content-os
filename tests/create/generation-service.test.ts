import { describe, expect, it } from "vitest";
import { generateDraftPackage, generateTopicPackage } from "../../src/lib/create/generation-service";
import type { CreateTopicCandidate } from "../../src/lib/create/types";

const sourceText = "昨天带宝宝出门，原本想拍很多照片，最后一直抱着他，一张也没拍。";
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
const metadata = {
  model: "test-model",
  durationMs: 1,
  repairCount: 0,
  responseFormat: "json_object" as const,
  promptCharacters: 300,
  promptBudgetExceeded: false,
};

function providerWithDrafts(drafts: Array<{ key: "record" | "perspective" | "concise"; body: string }>) {
  let calls = 0;
  return {
    id: "test-model",
    mode: "model" as const,
    async createDrafts() {
      calls += 1;
      return { data: drafts, metadata };
    },
    get calls() { return calls; },
  };
}

describe("minimal generation orchestration", () => {
  it("builds GroundingContext locally and gets exactly three topics from one provider call", async () => {
    let calls = 0;
    let received: unknown = null;
    const provider = {
      id: "volcengine_ark",
      mode: "model" as const,
      async createTopics(input: unknown) {
        calls += 1;
        received = input;
        return {
          data: {
            topics: [
              { title: "记录变化", focus: "只写事情", whyWorthWriting: "有变化", angle: "事情在前", missingInformation: [], sourceGrounding: ["今天重新打开 Content OS"] },
              { title: "判断变化", focus: "只写判断", whyWorthWriting: "有判断", angle: "判断在前", missingInformation: [], sourceGrounding: [] },
              { title: "克制留白", focus: "只写未完成", whyWorthWriting: "不总结", angle: "保留留白", missingInformation: [], sourceGrounding: [] },
            ],
          },
          metadata,
        };
      },
    } as never;

    const result = await generateTopicPackage({
      provider,
      sourceMode: "manual",
      sourceText: "今天重新打开 Content OS，终于感觉它像一个我会用的产品了。",
      platform: "wechat_moments",
      voiceStyleSummary: "短段落，先事实后判断。",
    });

    expect(calls).toBe(1);
    expect(result.topics).toHaveLength(3);
    expect("brief" in result).toBe(false);
    expect(received).toEqual(expect.objectContaining({
      groundingContext: expect.objectContaining({ rawInput: expect.stringContaining("Content OS") }),
      voiceStyleSummary: "短段落，先事实后判断。",
    }));
    expect(result.generation).toEqual(expect.objectContaining({
      generationMode: "volcengine_ark",
      fallback: false,
      promptCharacters: 300,
    }));
    expect(result.lightweightWarnings.length).toBeGreaterThan(0);
  });

  it("calls the draft provider once and marks similar drafts insufficient without retrying", async () => {
    const repeated = "昨天带宝宝出门。\n\n最后一张也没拍。";
    const provider = providerWithDrafts([
      { key: "record", body: repeated },
      { key: "perspective", body: repeated },
      { key: "concise", body: repeated },
    ]);

    const result = await generateDraftPackage({
      provider,
      topic,
      sourceMode: "manual",
      sourceText,
      voiceStyleSummary: "短段落",
      voiceSamples: [],
    });

    expect(provider.calls).toBe(1);
    expect(result.retryCount).toBe(0);
    expect(result.qualityStatus).toBe("insufficient");
  });

  it("marks unsupported launch and customer claims instead of rewriting them", async () => {
    const unlaunched = "透明工地小程序还没正式上线，真实客户验证也不够。";
    const provider = providerWithDrafts([
      { key: "record", body: "透明工地小程序已经正式上线。" },
      { key: "perspective", body: "客户已经充分认可。" },
      { key: "concise", body: "这件事还没做完。" },
    ]);

    const result = await generateDraftPackage({
      provider,
      topic,
      sourceMode: "project",
      sourceText: unlaunched,
      voiceStyleSummary: "",
      voiceSamples: [],
    });

    expect(provider.calls).toBe(1);
    expect(result.qualityStatus).toBe("insufficient");
    expect(result.qualityIssues.join("\n")).toMatch(/上线|客户/u);
  });

  it("requires attribution when the source contains an external opinion", async () => {
    const external = "我看到一个观点，说 AI 会放大人的认知差距。这是别人的观点。";
    const provider = providerWithDrafts([
      { key: "record", body: "AI 会放大人的认知差距。" },
      { key: "perspective", body: "我最近想到这件事。" },
      { key: "concise", body: "先停在这里。" },
    ]);

    const result = await generateDraftPackage({
      provider,
      topic,
      sourceMode: "manual",
      sourceText: external,
      voiceStyleSummary: "",
      voiceSamples: [],
    });

    expect(result.qualityStatus).toBe("insufficient");
    expect(result.qualityIssues).toContain("外部观点没有明确归属");
  });
});
