import { describe, expect, it } from "vitest";
import { reviewEditorialStyle } from "../../src/lib/editorial/style-reviewer";
import { suggestEditorialChanges } from "../../src/lib/editorial/rewrite-suggester";

const voiceProfile = {
  id: "voice-wechat-default",
  name: "齐鑫朋友圈真实近况",
  platform: "wechat_moments" as const,
  tone: "熟人感、克制、真实、带个人感受",
  preferredWords: ["最近"],
  avoidWords: ["赋能"],
  writingRules: ["第一人称"],
  exampleTexts: [],
};

describe("suggestEditorialChanges", () => {
  it("only returns optional suggestions and permits empty hook and cta", () => {
    const editorialDraft = {
      title: "透明工地资料整理",
      hook: "今天想和大家分享一次经历",
      body: "最近把资料重新整理了一遍。",
      cta: "",
    };
    const styleReview = reviewEditorialStyle({
      ...editorialDraft,
      voiceProfile,
      voiceSamples: [],
    });

    const result = suggestEditorialChanges({
      editorialDraft,
      styleReview,
      voiceProfile,
      voiceSamples: [],
    });

    expect(result.allowEmptyHook).toBe(true);
    expect(result.allowEmptyCta).toBe(true);
    expect(result.hookSuggestions.join(" ")).not.toContain("今天想和大家分享");
    expect(result.ctaSuggestions).toContain("可以留空，不必强行加入行动号召。");
  });

  it("does not introduce claims, metrics, or sales calls into suggestions", () => {
    const editorialDraft = {
      title: "透明工地资料整理",
      hook: "",
      body: "当前只能确认产品文档已形成，不能确认上线、客户、用户数量或收入。",
      cta: "",
    };
    const styleReview = reviewEditorialStyle({
      ...editorialDraft,
      voiceProfile,
      voiceSamples: [],
    });

    const result = suggestEditorialChanges({
      editorialDraft,
      styleReview,
      voiceProfile,
      voiceSamples: [],
    });
    const suggestions = JSON.stringify(result);

    expect(suggestions).not.toContain("用户数量已增长");
    expect(suggestions).not.toContain("年入百万");
    expect(suggestions).not.toContain("私信我");
  });
});
