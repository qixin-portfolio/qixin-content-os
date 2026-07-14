import { describe, expect, it } from "vitest";
import {
  calculateVoiceSampleWeight,
  extractVoiceStyleProfile,
} from "../../src/lib/create/voice-style";

const baseSample = {
  platform: "wechat_moments" as const,
  body: "昨天在外面等了一会儿。\n\n风没来，事情也没有结论……",
  qualityRating: 5,
  sourceType: "imported_post" as const,
  approved: true,
  active: true,
};

describe("weighted VoiceSample structure", () => {
  it("gives approved drafts the highest weight and keeps 5 > 4 > 3", () => {
    expect(calculateVoiceSampleWeight({ qualityRating: 5, sourceType: "approved_draft" }))
      .toBeGreaterThan(calculateVoiceSampleWeight({ qualityRating: 5, sourceType: "imported_post" }));
    expect(calculateVoiceSampleWeight({ qualityRating: 5, sourceType: "imported_post" }))
      .toBeGreaterThan(calculateVoiceSampleWeight({ qualityRating: 4, sourceType: "imported_post" }));
    expect(calculateVoiceSampleWeight({ qualityRating: 4, sourceType: "imported_post" }))
      .toBeGreaterThan(calculateVoiceSampleWeight({ qualityRating: 3, sourceType: "imported_post" }));
  });

  it("does not let internal index titles affect the style profile", () => {
    const first = extractVoiceStyleProfile([{ ...baseSample, title: "内部标题 A" }]);
    const second = extractVoiceStyleProfile([{ ...baseSample, title: "完全不同的内部索引标题" }]);

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toContain("内部标题");
  });

  it("extracts structural signals instead of sample sentences", () => {
    const profile = extractVoiceStyleProfile([{ ...baseSample, title: "不参与" }]);

    expect(profile.averageParagraphs).toBe(2);
    expect(profile.openingModes).toContain("scene");
    expect(profile.openEndingPreference).toBeGreaterThan(0);
    expect(JSON.stringify(profile)).not.toContain(baseSample.body);
  });
});
