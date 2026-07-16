import { describe, expect, it } from "vitest";
import { extractContentBrief } from "../../src/lib/create/content-brief";
import { generateFallbackTopics } from "../../src/lib/create/topic-generator";

describe("minimal create topic generator", () => {
  it("returns exactly three readable topics from a manual note", () => {
    const sourceText = "最近用 Codex 做了一个 Content OS，功能越来越多，反而忘了每天要写什么。";
    const topics = generateFallbackTopics({
      sourceMode: "manual",
      sourceText,
      platform: "wechat_moments",
      brief: extractContentBrief(sourceText),
    });

    expect(topics).toHaveLength(3);
    expect(new Set(topics.map((topic) => topic.key)).size).toBe(3);
    for (const topic of topics) {
      expect(topic.title).toBeTruthy();
      expect(topic.whyWorthWriting).toBeTruthy();
      expect(topic.recommendedAngle).toBeTruthy();
      expect(topic.platform).toBe("朋友圈");
      expect(topic.missingInformation).toContain("临时输入");
      expect(topic.sourceBasis).toBeTruthy();
      expect(topic.difference).toBeTruthy();
      expect(JSON.stringify(topic)).not.toMatch(/SourceItem|Revision|packageHash|evidenceStrength/);
    }
  });

  it("keeps short input usable while asking for one more concrete detail", () => {
    const sourceText = "今天改了一版";
    const topics = generateFallbackTopics({
      sourceMode: "manual",
      sourceText,
      platform: "wechat_moments",
      brief: extractContentBrief(sourceText),
    });

    expect(topics).toHaveLength(3);
    expect(topics.every((topic) => topic.missingInformation.includes("再补一句"))).toBe(true);
  });

  it("does not fabricate X topics when the research source is unavailable", () => {
    expect(() => generateFallbackTopics({
      sourceMode: "x",
      sourceText: "",
      platform: "wechat_moments",
      brief: extractContentBrief(""),
    })).toThrow("X 收藏研究库尚未接入当前版本");
  });

  it("creates three different content focuses rather than title paraphrases", () => {
    const sourceText = "最近用 Codex 做了一个 Content OS，做着做着功能越来越多，反而忘了自己真正需要的只是每天知道该写什么。";
    const topics = generateFallbackTopics({ sourceMode: "manual", sourceText, platform: "wechat_moments", brief: extractContentBrief(sourceText) });

    expect(topics.map((topic) => topic.difference).join(" ")).toContain("复杂");
    expect(topics.map((topic) => topic.difference).join(" ")).toContain("日常");
    expect(topics.map((topic) => topic.difference).join(" ")).toContain("产品");
  });

  it("does not invent a feature-complexity angle when the input never mentions features", () => {
    const sourceText = "今天重新打开 Content OS，终于感觉它像一个我会用的产品了。";
    const topics = generateFallbackTopics({
      sourceMode: "manual",
      sourceText,
      platform: "wechat_moments",
      brief: extractContentBrief(sourceText),
    });

    expect(JSON.stringify(topics)).not.toMatch(/功能复杂|会做功能|功能能力/);
    expect(topics[2].title).toContain("愿意使用");
  });

  it("keeps an attributed external idea focused on attribution and personal experience", () => {
    const sourceText = "我看到一个观点，说 AI 会放大人的认知差距。这是别人的观点，我想到的是自己最近做 Content OS 的经历。";
    const topics = generateFallbackTopics({
      sourceMode: "manual",
      sourceText,
      platform: "wechat_moments",
      brief: extractContentBrief(sourceText),
    });

    expect(JSON.stringify(topics)).not.toMatch(/功能复杂|会做功能|功能能力/);
    expect(topics[2].title).toContain("别人的观点");
    expect(topics[2].recommendedAngle).toContain("个人经历");
  });
});
