import { describe, expect, it } from "vitest";
import { extractContentBrief } from "../../src/lib/create/content-brief";
import { generateFallbackDrafts } from "../../src/lib/create/draft-generator";

const sourceText = "最近用 Codex 做了一个 Content OS，做着做着功能越来越多，反而忘了自己真正需要的只是每天知道该写什么。";
const topic = {
  key: "focus" as const,
  title: "做内容系统时，我差点忘了最初的问题",
  whyWorthWriting: "这次变化能说明工具和真实需求之间的距离。",
  recommendedAngle: "从功能越做越多写到重新确认真正需要。",
  platform: "朋友圈" as const,
  missingInformation: "这部分来自你的临时输入，发布前请确认准确。",
  sourceBasis: "来自用户输入。",
  difference: "聚焦产品复杂度。",
};

describe("minimal create draft generator", () => {
  it("generates the three approved WeChat variants without copying sample sentences", () => {
    const privateSampleSentence = "这是一句绝不能出现在候选稿里的私人样本文本";
    const drafts = generateFallbackDrafts({
      sourceMode: "manual",
      sourceText,
      brief: extractContentBrief(sourceText),
      topic,
      voiceSamples: [{
        platform: "wechat_moments",
        body: privateSampleSentence,
        qualityRating: 5,
        sourceType: "approved_draft",
        approved: true,
        active: true,
      }],
    });

    expect(drafts.map((draft) => draft.name)).toEqual([
      "真实记录版",
      "个人观点版",
      "克制短版",
    ]);
    expect(drafts.map((draft) => draft.body).join("\n")).toContain("Content OS");
    for (const draft of drafts) {
      expect(extractContentBrief(sourceText).concreteDetails.some((detail) => draft.body.includes(detail))).toBe(true);
      expect(draft.body).not.toContain(privateSampleSentence);
      expect(draft.lightweightWarnings.length).toBeLessThanOrEqual(3);
      expect(draft.assetSuggestions.length).toBeGreaterThan(0);
    }
  });

  it("keeps warnings advisory and never edits the supplied body", () => {
    const drafts = generateFallbackDrafts({
      sourceMode: "manual",
      sourceText,
      brief: extractContentBrief(sourceText),
      topic,
      voiceSamples: [],
    });
    const selectedBody = drafts[0].body;

    expect(selectedBody).toBe(drafts[0].body);
    expect(drafts[0].lightweightWarnings).toContain("这部分来自你的临时输入，发布前请确认准确。");
  });

  it("uses different openings and endings instead of shortened copies", () => {
    const drafts = generateFallbackDrafts({ sourceMode: "manual", sourceText, brief: extractContentBrief(sourceText), topic, voiceSamples: [] });
    const firstLines = drafts.map((draft) => draft.body.split(/[。！？\n]/)[0]);
    const endings = drafts.map((draft) => draft.body.trim().split(/\n\s*\n/).at(-1));

    expect(new Set(firstLines).size).toBe(3);
    expect(new Set(endings).size).toBe(3);
    expect(drafts.map((draft) => draft.body).join("\n")).not.toMatch(/做到这里才发现|有一个很直接的感受|先把这个偏差记下来|其他功能再慢慢看/);
  });

  it("does not turn a life scene into a lesson or add a next step", () => {
    const life = "昨天带宝宝出门，原本想拍很多照片，最后一直抱着他，一张也没拍。";
    const drafts = generateFallbackDrafts({ sourceMode: "manual", sourceText: life, brief: extractContentBrief(life), topic, voiceSamples: [] });
    const combined = drafts.map((draft) => draft.body).join("\n");

    expect(combined).not.toMatch(/成长|意义|教会|人生|接下来|下一步/);
  });

  it("keeps external viewpoints attributed and never upgrades unlaunched work", () => {
    const external = "我看到一个观点，说 AI 会放大人的认知差距。这是别人的观点，我想到的是自己最近做 Content OS 的经历。";
    const externalDrafts = generateFallbackDrafts({ sourceMode: "manual", sourceText: external, brief: extractContentBrief(external), topic, voiceSamples: [] });
    expect(externalDrafts.every((draft) => draft.body.includes("别人") || draft.body.includes("看到一个观点"))).toBe(true);

    const unlaunched = "透明工地小程序最近一直没正式上线，我发现自己做了很多功能，但真实客户验证还是不够。";
    const unlaunchedDrafts = generateFallbackDrafts({ sourceMode: "manual", sourceText: unlaunched, brief: extractContentBrief(unlaunched), topic, voiceSamples: [] });
    expect(unlaunchedDrafts.map((draft) => draft.body).join("\n")).not.toMatch(/已经正式上线|成功上线|客户认可/);
  });
});
