import { describe, expect, it } from "vitest";
import { generateDraftPackage, generateTopicPackage } from "../../src/lib/create/generation-service";
import { LocalFallbackProvider } from "../../src/lib/create/provider";

const inputs = [
  "今天重新打开 Content OS，终于感觉它像一个我会用的产品了。",
  "透明工地小程序最近一直没正式上线，我发现自己做了很多功能，但真实客户验证还是不够。",
  "最近越来越觉得 AI 没有让我轻松，反而让我看到更多以前没能力做的事情。",
  "昨天带宝宝出门，原本想拍很多照片，最后一直抱着他，一张也没拍。",
  "我看到一个观点，说 AI 会放大人的认知差距。这是别人的观点，我想到的是自己最近做 Content OS 的经历。",
];

describe("five real acceptance inputs in deterministic fallback", () => {
  it.each(inputs)("keeps three topics and three drafts distinct for: %s", async (sourceText) => {
    const provider = new LocalFallbackProvider();
    const topicPackage = await generateTopicPackage({ provider, sourceMode: "manual", sourceText, platform: "wechat_moments", voiceStyleSummary: "" });
    const draftPackage = await generateDraftPackage({
      provider,
      topic: topicPackage.topics[0],
      sourceMode: "manual",
      sourceText,
      voiceStyleSummary: "",
      voiceSamples: [],
    });

    expect(topicPackage.topics).toHaveLength(3);
    expect(new Set(topicPackage.topics.map((topic) => topic.difference)).size).toBe(3);
    expect(draftPackage.drafts).toHaveLength(3);
    expect(draftPackage.retryCount).toBe(0);
    expect(draftPackage.drafts.map((draft) => draft.body).join("\n")).not.toMatch(/最近最大的感受|做到这里才发现|有一个很直接的感受|先把这个偏差记下来|这个判断还要继续验证|其他功能再慢慢看|其他的以后再加|记录一下/);
  });

  it("keeps special fact boundaries across the acceptance set", async () => {
    const provider = new LocalFallbackProvider();
    async function bodies(sourceText: string) {
      const topics = await generateTopicPackage({ provider, sourceMode: "manual", sourceText, platform: "wechat_moments", voiceStyleSummary: "" });
      const drafts = await generateDraftPackage({ provider, topic: topics.topics[0], sourceMode: "manual", sourceText, voiceStyleSummary: "", voiceSamples: [] });
      return drafts.drafts.map((draft) => draft.body).join("\n");
    }

    await expect(bodies(inputs[1])).resolves.not.toMatch(/已经正式上线|成功上线|客户认可/);
    const life = await bodies(inputs[3]);
    expect(life).not.toMatch(/人生|成长|意义|教会了我|接下来|下一步/);
    expect(life).not.toMatch(/(?:^|\n)拍很多照片。/u);
    expect(life).toContain("原本想拍很多照片");
    const external = await bodies(inputs[4]);
    expect(external.match(/别人|看到一个观点/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("does not turn many features into an unsupported complexity claim", async () => {
    const provider = new LocalFallbackProvider();
    const result = await generateTopicPackage({
      provider,
      sourceMode: "manual",
      sourceText: inputs[1],
      platform: "wechat_moments",
      voiceStyleSummary: "",
    });

    expect(JSON.stringify(result.topics)).not.toContain("复杂");
  });
});
