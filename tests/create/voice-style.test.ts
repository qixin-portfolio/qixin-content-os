import { describe, expect, it } from "vitest";
import {
  calculateVoiceSampleWeight,
  extractVoiceStyleProfile,
  selectVoiceSamplesForPrompt,
  summarizeVoiceStyle,
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

  it("selects high-quality samples and at most two rating-4 helpers", () => {
    const samples = [
      { ...baseSample, body: "approved-five", sourceType: "approved_draft" as const },
      { ...baseSample, body: "imported-five" },
      { ...baseSample, body: "rating-four-a", qualityRating: 4 },
      { ...baseSample, body: "rating-four-b", qualityRating: 4 },
      { ...baseSample, body: "rating-four-c", qualityRating: 4 },
      { ...baseSample, body: "rating-three", qualityRating: 3 },
    ];

    const selected = selectVoiceSamplesForPrompt(samples);
    expect(selected.map((sample) => sample.body)).toEqual([
      "approved-five",
      "imported-five",
      "rating-four-a",
      "rating-four-b",
    ]);
    expect(selected.map((sample) => sample.body)).not.toContain("rating-three");
  });

  it("creates a concise profile-only summary without sample titles or bodies", () => {
    const profile = extractVoiceStyleProfile([{ ...baseSample, title: "PRIVATE TITLE" }]);
    const summary = summarizeVoiceStyle(profile);

    expect(Array.from(summary).length).toBeLessThanOrEqual(600);
    expect(summary).not.toContain("PRIVATE TITLE");
    expect(summary).not.toContain(baseSample.body);
    expect(summary).toContain("段落");
  });
});
