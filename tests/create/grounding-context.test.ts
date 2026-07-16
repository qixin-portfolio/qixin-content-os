import { describe, expect, it } from "vitest";
import { createGroundingContext, groundingWarnings } from "../../src/lib/create/grounding-context";

describe("local GroundingContext", () => {
  it("keeps the complete raw input and does not infer emotion, result or next step", () => {
    const rawInput = `${"真实项目过程。".repeat(900)}最后一句不能被裁剪。`;
    const context = createGroundingContext({
      rawInput,
      sourceMode: "manual",
      platform: "wechat_moments",
    });

    expect(context.rawInput).toBe(rawInput);
    expect(context.confirmedUserStatements.join("\n")).toContain("最后一句不能被裁剪");
    expect(JSON.stringify(context)).not.toMatch(/开心|焦虑|成功|下一步要/u);
  });

  it("preserves external-opinion markers without claiming ownership", () => {
    const context = createGroundingContext({
      rawInput: "我看到一个观点，说 AI 会放大人的认知差距。这是别人的观点。",
      sourceMode: "manual",
      platform: "wechat_moments",
    });

    expect(context.externalOpinionMarkers).toEqual(expect.arrayContaining(["看到一个观点", "这是别人的观点"]));
    expect(context.prohibitedClaims).toContain("把外部观点写成齐鑫原创观点");
  });

  it("protects an explicitly unlaunched state and returns lightweight warnings", () => {
    const context = createGroundingContext({
      rawInput: "透明工地小程序还没正式上线，真实客户验证也不够。",
      sourceMode: "project",
      platform: "wechat_moments",
    });

    expect(context.prohibitedClaims).toEqual(expect.arrayContaining([
      "写成已经正式上线",
      "写成已经获得充分的真实客户验证",
    ]));
    expect(groundingWarnings(context).join("\n")).toContain("不要写成已经正式上线");
  });
});
