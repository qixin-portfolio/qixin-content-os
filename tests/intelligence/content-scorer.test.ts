import { describe, expect, it } from "vitest";
import { contentScoreFromPersistence, scoreEventCard } from "../../src/lib/content/content-scorer";
import { ordinaryBugEvent, ordinaryBugSources, realEvent, realSources } from "./fixtures";

describe("scoreEventCard", () => {
  it("converts persisted flat scores back to the domain score shape", () => {
    const score = contentScoreFromPersistence({
      noveltyScore: 12,
      personalScore: 14,
      industryScore: 10,
      visualScore: 8,
      businessScore: 6,
      totalScore: 50,
      recommendation: "archive_only",
      reason: "persisted reason",
    });

    expect(score.novelty.score).toBe(12);
    expect(score.personal.score).toBe(14);
    expect(score.totalScore).toBe(50);
    expect(score.recommendation).toBe("archive_only");
    expect(score.reason).toBe("persisted reason");
  });

  it("keeps every dimension between 0 and 20 and total between 0 and 100", () => {
    const score = scoreEventCard(realEvent, realSources);

    for (const dimension of [score.novelty, score.personal, score.industry, score.visual, score.business]) {
      expect(dimension.score).toBeGreaterThanOrEqual(0);
      expect(dimension.score).toBeLessThanOrEqual(20);
    }
    expect(score.totalScore).toBeGreaterThanOrEqual(0);
    expect(score.totalScore).toBeLessThanOrEqual(100);
  });

  it("does not recommend a routine bug fix for immediate publishing", () => {
    const score = scoreEventCard(ordinaryBugEvent, ordinaryBugSources);

    expect(score.recommendation).not.toBe("publish_now");
    expect(score.totalScore).toBeLessThan(80);
  });

  it("can recommend immediate publishing for a complete evidence-backed event", () => {
    const score = scoreEventCard(realEvent, realSources);

    expect(score.recommendation).toBe("publish_now");
  });

  it("does not use the title as the only scoring signal", () => {
    const score = scoreEventCard(
      { ...ordinaryBugEvent, title: "完成重大产品发布" },
      ordinaryBugSources,
    );

    expect(score.totalScore).toBeLessThan(80);
  });
});
