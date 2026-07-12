import { describe, expect, it } from "vitest";
import { generateContentAngles } from "../../src/lib/content/angle-generator";
import { scoreEventCard } from "../../src/lib/content/content-scorer";
import { generateMasterContentFromIntelligence } from "../../src/lib/ai/content-generator";
import { ordinaryBugEvent, ordinaryBugSources, realEvent, realSources } from "./fixtures";

const voiceProfile = {
  id: "voice-wechat",
  name: "齐鑫朋友圈真实近况",
  platform: "wechat_moments" as const,
  tone: "熟人感、克制、真实、带个人感受",
  preferredWords: ["最近", "记录一下"],
  avoidWords: ["震撼", "重磅", "赋能"],
  writingRules: ["第一人称", "可以承认失败和没做完"],
  exampleTexts: [],
};

describe("generateMasterContentFromIntelligence", () => {
  it("returns fact references and does not use voice avoidWords", () => {
    const contentScore = scoreEventCard(realEvent, realSources);
    const selectedAngle = generateContentAngles(realEvent, contentScore)[0];
    const draft = generateMasterContentFromIntelligence({
      eventCard: { ...realEvent, sourceItems: realSources },
      contentScore,
      selectedAngle,
      voiceProfile,
    });

    expect(draft.factReferences).toEqual(realSources.map((source) => source.id));
    expect(JSON.stringify(draft)).not.toContain("震撼");
    expect(draft.story).toContain(realEvent.result);
  });

  it("rejects archive_only events", () => {
    const contentScore = scoreEventCard(ordinaryBugEvent, ordinaryBugSources);
    const selectedAngle = generateContentAngles(ordinaryBugEvent, contentScore)[0];

    expect(() =>
      generateMasterContentFromIntelligence({
        eventCard: { ...ordinaryBugEvent, sourceItems: ordinaryBugSources },
        contentScore: { ...contentScore, recommendation: "archive_only" },
        selectedAngle,
        voiceProfile,
      }),
    ).toThrow("archive_only");
  });

  it("rejects an event without source item references", () => {
    const contentScore = scoreEventCard(realEvent, realSources);
    const selectedAngle = generateContentAngles(realEvent, contentScore)[0];

    expect(() =>
      generateMasterContentFromIntelligence({
        eventCard: realEvent,
        contentScore,
        selectedAngle,
        voiceProfile,
      }),
    ).toThrow("SourceItem");
  });
});
