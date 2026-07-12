import { describe, expect, it } from "vitest";
import { generateContentAngles } from "../../src/lib/content/angle-generator";
import { scoreEventCard } from "../../src/lib/content/content-scorer";
import { ordinaryBugEvent, ordinaryBugSources, realEvent, realSources } from "./fixtures";

describe("generateContentAngles", () => {
  it("generates at least three fact-based angles for a high-value event", () => {
    const score = scoreEventCard(realEvent, realSources);
    const angles = generateContentAngles(realEvent, score);

    expect(angles.length).toBeGreaterThanOrEqual(3);
    expect(angles.length).toBeLessThanOrEqual(5);
    expect(JSON.stringify(angles)).toContain(realEvent.result);
    expect(JSON.stringify(angles)).toContain(realEvent.personalReflection);
    expect(JSON.stringify(angles)).not.toContain("用户数量已增长");
  });

  it("limits low-value events to two angles", () => {
    const score = scoreEventCard(ordinaryBugEvent, ordinaryBugSources);
    const angles = generateContentAngles(ordinaryBugEvent, score);

    expect(angles.length).toBeLessThanOrEqual(2);
    expect(angles.length).toBeGreaterThanOrEqual(2);
  });
});
