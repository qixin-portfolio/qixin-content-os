import { describe, expect, it } from "vitest";
import { generateCreateTopics } from "../../src/lib/create/topic-generator";

describe("minimal create topic generator", () => {
  it("returns exactly three readable topics from a manual note", () => {
    const topics = generateCreateTopics({
      sourceMode: "manual",
      sourceText: "最近用 Codex 做了一个 Content OS，功能越来越多，反而忘了每天要写什么。",
      platform: "wechat_moments",
    });

    expect(topics).toHaveLength(3);
    expect(new Set(topics.map((topic) => topic.key)).size).toBe(3);
    for (const topic of topics) {
      expect(topic.title).toBeTruthy();
      expect(topic.whyWorthWriting).toBeTruthy();
      expect(topic.recommendedAngle).toBeTruthy();
      expect(topic.platform).toBe("朋友圈");
      expect(topic.missingInformation).toContain("临时输入");
      expect(JSON.stringify(topic)).not.toMatch(/SourceItem|Revision|packageHash|evidenceStrength/);
    }
  });

  it("keeps short input usable while asking for one more concrete detail", () => {
    const topics = generateCreateTopics({
      sourceMode: "manual",
      sourceText: "今天改了一版",
      platform: "wechat_moments",
    });

    expect(topics).toHaveLength(3);
    expect(topics.every((topic) => topic.missingInformation.includes("再补一句"))).toBe(true);
  });

  it("does not fabricate X topics when the research source is unavailable", () => {
    expect(() => generateCreateTopics({
      sourceMode: "x",
      sourceText: "",
      platform: "wechat_moments",
    })).toThrow("X 收藏研究库尚未接入当前版本");
  });
});
