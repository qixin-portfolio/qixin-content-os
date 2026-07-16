import { describe, expect, it } from "vitest";
import { createFactQuestions, nonEmptyFactAnswers } from "../../src/lib/create/fact-questions";
import { createEmptySession, loadCreateSession, saveCreateSession } from "../../src/lib/create/session";

describe("fact enrichment", () => {
  it("asks at most three input-specific questions and accepts blank answers", () => {
    const questions = createFactQuestions({ sourceText: "昨天带宝宝出门，一张也没拍。", sourceMode: "manual" });
    expect(questions).toHaveLength(3);
    expect(questions[0]).toContain("哪里");
    expect(nonEmptyFactAnswers(["", "抱着他", ""])).toEqual(["抱着他"]);
  });

  it("persists local fact answers and sparse mode without a database", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
    const session = { ...createEmptySession("2026-07-16T00:00:00.000Z"), factQuestions: ["发生在哪里？"], factAnswers: ["西湖边"], detailMode: "sparse" as const };
    expect(saveCreateSession(storage, session)).toEqual({ ok: true });
    expect(loadCreateSession(storage).session).toMatchObject({ factAnswers: ["西湖边"], detailMode: "sparse" });
  });
});
