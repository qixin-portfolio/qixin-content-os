import { describe, expect, it } from "vitest";
import {
  calculateVoiceSampleWeight,
  generateCreateDrafts,
} from "../../src/lib/create/draft-generator";

const sourceText = "最近用 Codex 做了一个 Content OS，做着做着功能越来越多，反而忘了自己真正需要的只是每天知道该写什么。";
const topic = {
  key: "focus" as const,
  title: "做内容系统时，我差点忘了最初的问题",
  whyWorthWriting: "这次变化能说明工具和真实需求之间的距离。",
  recommendedAngle: "从功能越做越多写到重新确认真正需要。",
  platform: "朋友圈" as const,
  missingInformation: "这部分来自你的临时输入，发布前请确认准确。",
};

describe("minimal create draft generator", () => {
  it("generates the three approved WeChat variants without copying sample sentences", () => {
    const privateSampleSentence = "这是一句绝不能出现在候选稿里的私人样本文本";
    const drafts = generateCreateDrafts({
      sourceMode: "manual",
      sourceText,
      topic,
      voiceProfile: null,
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
    for (const draft of drafts) {
      expect(draft.body).toContain("Content OS");
      expect(draft.body).not.toContain(privateSampleSentence);
      expect(draft.lightweightWarnings.length).toBeLessThanOrEqual(3);
      expect(draft.assetSuggestions.length).toBeGreaterThan(0);
    }
  });

  it("weights quality and approved drafts without treating low-quality samples as canonical", () => {
    expect(calculateVoiceSampleWeight({ qualityRating: 5, sourceType: "approved_draft" }))
      .toBeGreaterThan(calculateVoiceSampleWeight({ qualityRating: 5, sourceType: "imported_post" }));
    expect(calculateVoiceSampleWeight({ qualityRating: 5, sourceType: "imported_post" }))
      .toBeGreaterThan(calculateVoiceSampleWeight({ qualityRating: 4, sourceType: "imported_post" }));
    expect(calculateVoiceSampleWeight({ qualityRating: 4, sourceType: "imported_post" }))
      .toBeGreaterThan(calculateVoiceSampleWeight({ qualityRating: 3, sourceType: "imported_post" }));
  });

  it("keeps warnings advisory and never edits the supplied body", () => {
    const drafts = generateCreateDrafts({
      sourceMode: "manual",
      sourceText,
      topic,
      voiceProfile: null,
      voiceSamples: [],
    });
    const selectedBody = drafts[0].body;

    expect(selectedBody).toBe(drafts[0].body);
    expect(drafts[0].lightweightWarnings).toContain("这部分来自你的临时输入，发布前请确认准确。");
  });
});
