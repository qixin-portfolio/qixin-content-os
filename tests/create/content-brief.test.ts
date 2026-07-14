import { describe, expect, it } from "vitest";
import { constrainContentBrief, extractContentBrief } from "../../src/lib/create/content-brief";

describe("ContentBrief extraction", () => {
  it("keeps an unlaunched project unlaunched and does not invent a next step", () => {
    const source = "透明工地小程序最近一直没正式上线，我发现自己做了很多功能，但真实客户验证还是不够。";
    const brief = extractContentBrief(source);

    expect(brief.whatHappened).toContain("没正式上线");
    expect(brief.tension).toContain("真实客户验证还是不够");
    expect(brief.possibleNextStep).toBeNull();
    expect(brief.prohibitedClaims).toContain("透明工地小程序已经正式上线");
    expect(JSON.stringify(brief)).not.toContain("客户认可");
  });

  it("separates an external idea from the user's own experience", () => {
    const source = "我看到一个观点，说 AI 会放大人的认知差距。这是别人的观点，我想到的是自己最近做 Content OS 的经历。";
    const brief = extractContentBrief(source);

    expect(brief.externalReferences).toContain("AI 会放大人的认知差距");
    expect(brief.personalReaction).toContain("自己最近做 Content OS 的经历");
    expect(brief.confirmedFacts).toContain("这个观点来自别人");
  });

  it("preserves a life scene without turning it into a lesson", () => {
    const source = "昨天带宝宝出门，原本想拍很多照片，最后一直抱着他，一张也没拍。";
    const brief = extractContentBrief(source);

    expect(brief.concreteDetails).toEqual(expect.arrayContaining(["昨天带宝宝出门", "最后一直抱着他", "一张也没拍"]));
    expect(brief.personalJudgment).toBeNull();
    expect(brief.possibleNextStep).toBeNull();
  });

  it("removes model details that do not appear in the user's input", () => {
    const source = "今天重新打开 Content OS，终于感觉它像一个我会用的产品了。";
    const baseline = extractContentBrief(source);
    const constrained = constrainContentBrief({
      ...baseline,
      concreteDetails: [...baseline.concreteDetails, "我邀请了三个朋友试用"],
      confirmedFacts: [...baseline.confirmedFacts, "三个朋友都给了好评"],
      possibleNextStep: "明天正式上线",
    }, source);

    expect(JSON.stringify(constrained)).not.toMatch(/三个朋友|好评|明天正式上线/);
    expect(constrained.possibleNextStep).toBeNull();
  });
});
