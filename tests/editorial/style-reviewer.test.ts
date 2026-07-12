import { describe, expect, it } from "vitest";
import { reviewEditorialStyle } from "../../src/lib/editorial/style-reviewer";

const voiceProfile = {
  id: "voice-wechat-default",
  name: "齐鑫朋友圈真实近况",
  platform: "wechat_moments" as const,
  tone: "熟人感、克制、真实、带个人感受",
  preferredWords: ["最近", "记录一下"],
  avoidWords: ["震撼", "重磅", "赋能"],
  writingRules: ["第一人称", "可以承认失败和没做完"],
  exampleTexts: [],
};

describe("reviewEditorialStyle", () => {
  it("detects template openings, sales language, certainty, and avoidWords", () => {
    const review = reviewEditorialStyle({
      title: "重磅更新！",
      hook: "你有没有发现，在这个时代一定要赋能自己！！！",
      body: "这不仅仅是一次记录，更是彻底改变。",
      cta: "赶紧收藏，私信我领取。",
      voiceProfile,
      voiceSamples: [],
    });

    expect(review.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "template_opening",
      "sales_tone",
      "over_summary",
      "false_certainty",
      "avoid_word",
      "excessive_punctuation",
    ]));
    expect(review.salesToneScore).toBeGreaterThan(0);
    expect(review.overallScore).toBeLessThan(70);
  });

  it("allows empty hook and cta and recognizes an approved voice sample", () => {
    const review = reviewEditorialStyle({
      title: "透明工地资料整理",
      hook: "",
      body: "最近把产品资料和证据缺口重新整理了一遍。",
      cta: "",
      voiceProfile,
      voiceSamples: [{
        platform: "wechat_moments",
        title: "最近的记录",
        body: "最近把一个项目重新整理了一遍。",
        qualityRating: 5,
        approved: true,
      }],
    });

    expect(review.issues.some((issue) => issue.code === "missing_hook")).toBe(false);
    expect(review.issues.some((issue) => issue.code === "missing_cta")).toBe(false);
    expect(review.authenticityScore).toBeGreaterThan(40);
  });
});
