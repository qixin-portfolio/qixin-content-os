import { describe, expect, it } from "vitest";
import { generateDraftPackage } from "../../src/lib/create/generation-service";
import type { RawCreateDraft } from "../../src/lib/create/draft-generator";
import type { CreateTopicCandidate } from "../../src/lib/create/types";

const metadata = { model: "mock", durationMs: 1, repairCount: 0, responseFormat: "json_object" as const, promptCharacters: 1, promptBudgetExceeded: false };
const topic: CreateTopicCandidate = { key: "record", title: "记录", whyWorthWriting: "真实", recommendedAngle: "原话", platform: "朋友圈", missingInformation: "", sourceBasis: "原输入", difference: "不同" };
const projectInput = "最近用 Codex 做了一个 Content OS。";
const projectAnswers = ["打开 Publication 页面时，看到了证据来源、hash 和检查单等很多功能，不知道平时应该怎么用。", "真正想要的是打开工具后，直接知道今天有什么值得写。"];

function provider(drafts: RawCreateDraft[]) {
  let received: unknown = null;
  return {
    id: "volcengine_ark",
    mode: "model" as const,
    get received() { return received; },
    async createDrafts(input: unknown) { received = input; return { data: drafts, metadata }; },
  };
}

function draft(key: RawCreateDraft["key"], body: string, factIds = ["F1"], interpretations: RawCreateDraft["interpretations"] = []): RawCreateDraft {
  return { key, body, usedFacts: [{ claim: body, factIds }], interpretations };
}

const normalRewriteDrafts = [
  draft("record", "打开 Publication 页面，功能和检查项很多，但我反而不知道日常该怎么用。", ["F2"]),
  draft("perspective", "功能更多，不一定更接近真实需求。", ["F2", "F3"], [{ text: "功能更多，不一定更接近真实需求", basisFactIds: ["F2", "F3"] }]),
  draft("concise", "打开工具后，直接知道今天有什么值得写，才是我真正想要的。", ["F3"]),
];

async function generate(drafts: RawCreateDraft[], overrides: Partial<{ sourceText: string; factAnswers: string[] }> = {}) {
  const p = provider(drafts);
  const result = await generateDraftPackage({
    provider: p,
    topic,
    sourceMode: "manual",
    sourceText: overrides.sourceText ?? projectInput,
    factAnswers: overrides.factAnswers ?? projectAnswers,
    detailMode: "enriched",
    voiceStyleSummary: "",
    voiceSamples: [],
  });
  return { p, result };
}

describe("Fact-ID grounded draft contract", () => {
  it("allows a normal rewrite when it cites valid fact IDs", async () => {
    const { p, result } = await generate(normalRewriteDrafts);

    expect(result.qualityStatus).toBe("passed");
    expect(result.drafts).toHaveLength(3);
    expect(result.drafts.map((item) => item.body)).toEqual(normalRewriteDrafts.map((item) => item.body));
    expect(result.drafts.every((item) => !("usedFacts" in item) && !("interpretations" in item))).toBe(true);
    expect(p.received).toEqual(expect.objectContaining({ factLedger: expect.objectContaining({ facts: expect.arrayContaining([expect.objectContaining({ id: "F2", text: projectAnswers[0] })]) }) }));
  });

  it("rejects missing or unknown fact IDs without fallback", async () => {
    const { result } = await generate([
      draft("record", "打开 Publication 页面。", ["F99"]),
      { key: "perspective", body: "功能更多，不一定更接近真实需求。", usedFacts: [{ claim: "功能更多", factIds: [] }], interpretations: [] },
      normalRewriteDrafts[2],
    ]);

    expect(result.generation.fallback).toBe(false);
    expect(result.rejectedDrafts.map((item) => item.key)).toEqual(["record", "perspective"]);
    expect(result.qualityIssues.join("\n")).toMatch(/fact ID/u);
  });

  it("accepts attributed external opinions and rejects an external claim made into the user's own conclusion", async () => {
    const sourceText = "我看到一个观点，说 AI 会放大人的认知差距。这是别人的观点，我想到的是自己最近做 Content OS 的经历。";
    const attributed = await generate([
      draft("record", "我看到一个观点：AI 会放大人的认知差距。", ["F1"]),
      draft("perspective", "这是别人的观点，它让我想到自己最近做 Content OS 的经历。", ["F1", "F2"]),
      draft("concise", "一篇外部长文里的观点，刚好让我想到 Content OS。", ["F1", "F2"]),
    ], { sourceText, factAnswers: [] });
    const uncredited = await generate([
      draft("record", "AI 一定会放大人的认知差距。", ["F1"]),
      normalRewriteDrafts[1],
      normalRewriteDrafts[2],
    ], { sourceText, factAnswers: [] });

    expect(attributed.result.qualityStatus).toBe("passed");
    expect(uncredited.result.rejectedDrafts).toEqual(expect.arrayContaining([expect.objectContaining({ key: "record" })]));
    expect(uncredited.result.qualityIssues).toContain("外部观点没有明确归属");
  });

  it.each([
    ["今天我才明白", "新时间"],
    ["在西湖边我才明白", "新地点"],
    ["我走到门口才明白", "新动作"],
    ["手酸的时候我才明白", "身体感受"],
    ["已经有十个用户，说明项目成功了", "数字和项目结果"],
  ])("rejects an interpretation containing %s", async (interpretation) => {
    const { result } = await generate([
      draft("record", normalRewriteDrafts[0].body, ["F2"], [{ text: interpretation, basisFactIds: ["F2"] }]),
      normalRewriteDrafts[1],
      normalRewriteDrafts[2],
    ]);

    expect(result.rejectedDrafts).toEqual(expect.arrayContaining([expect.objectContaining({ key: "record" })]));
    expect(result.qualityIssues).toContain("抽象判断包含新的具体事实");
  });

  it("does not require external attribution from a draft that cites only the user's separate judgment", async () => {
    const sourceText = "我看到一个观点，说 AI 会放大人的认知差距。这是别人的观点，我想到的是自己最近做 Content OS 的经历。";
    const { result } = await generate([
      draft("record", "我最近做 Content OS 的经历还在继续。", ["F2"]),
      draft("perspective", "我想到的是自己最近做 Content OS 的经历。", ["F2"]),
      draft("concise", "先把自己的经历写清楚。", ["F2"]),
    ], { sourceText, factAnswers: [] });

    expect(result.qualityStatus).toBe("passed");
  });

  it("keeps sparse versions structurally distinct without adding facts", async () => {
    const sourceText = "昨天带宝宝出门，原本想拍很多照片，最后一直抱着他，一张也没拍。";
    const { result } = await generate([
      draft("record", "昨天带宝宝出门。原本想拍很多照片。最后一直抱着他，一张也没拍。", ["F1"]),
      draft("perspective", "有些生活没有照片，也确实发生过。", ["F1"], [{ text: "有些生活没有照片，也确实发生过", basisFactIds: ["F1"] }]),
      draft("concise", "一直抱着他。\n\n一张也没拍。", ["F1"]),
    ], { sourceText, factAnswers: [] });

    expect(result.qualityStatus).toBe("passed");
    expect(new Set(result.drafts.map((item) => item.body))).toHaveLength(3);
  });
});
