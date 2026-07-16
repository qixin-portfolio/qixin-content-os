import { describe, expect, it } from "vitest";
import { generateDraftPackage } from "../../src/lib/create/generation-service";
import type { RawCreateDraft } from "../../src/lib/create/draft-generator";
import type { DraftRepairInput } from "../../src/lib/create/provider";
import type { CreateTopicCandidate } from "../../src/lib/create/types";

const topic: CreateTopicCandidate = { key: "record", title: "记录", whyWorthWriting: "真实", recommendedAngle: "原话", platform: "朋友圈", missingInformation: "", sourceBasis: "原输入", difference: "不同" };
const sourceText = "昨天带宝宝出门，最后一直抱着他，一张也没拍。";
const metadata = { model: "mock", durationMs: 1, repairCount: 0, responseFormat: "json_object" as const, promptCharacters: 1, promptBudgetExceeded: false };
const valid = (key: "record" | "perspective" | "concise", body: string): RawCreateDraft => ({ key, body, usedFacts: [{ claim: body, sourceQuote: "昨天带宝宝出门" }], inferredStatements: [] });

function provider(initial: RawCreateDraft[], repairs: Partial<Record<RawCreateDraft["key"], RawCreateDraft | Error>> = {}) {
  const repairInputs: DraftRepairInput[] = [];
  return {
    id: "volcengine_ark", mode: "model" as const, repairInputs,
    async createDrafts() { return { data: initial, metadata }; },
    async repairDraft(input: DraftRepairInput) { repairInputs.push(input); const result = repairs[input.key]; if (result instanceof Error) throw result; return { data: result ?? initial.find((draft) => draft.key === input.key)!, metadata }; },
  };
}

async function run(p: ReturnType<typeof provider>) {
  return generateDraftPackage({ provider: p, topic, sourceMode: "manual", sourceText, voiceStyleSummary: "", voiceSamples: [], factAnswers: ["没有更多细节"], detailMode: "sparse" });
}

describe("targeted grounded-draft repair", () => {
  it("does not repair three valid drafts", async () => {
    const p = provider([valid("record", sourceText), valid("perspective", "最后一直抱着他。"), valid("concise", "一张也没拍。")]);
    const result = await run(p);
    expect(p.repairInputs).toHaveLength(0); expect(result.retryCount).toBe(0); expect(result.drafts).toHaveLength(3);
  });
  it("repairs only one failed draft and preserves valid bodies", async () => {
    const record = valid("record", sourceText); const concise = valid("concise", "一张也没拍。");
    const p = provider([record, { key: "perspective", body: "在西湖边手酸了。", usedFacts: [], inferredStatements: [] }, concise], { perspective: valid("perspective", "最后一直抱着他。") });
    const result = await run(p);
    expect(p.repairInputs).toHaveLength(1); expect(p.repairInputs[0].key).toBe("perspective"); expect(p.repairInputs[0].factAnswers).toEqual(["没有更多细节"]); expect(result.retryCount).toBe(1); expect(result.drafts.find((draft) => draft.key === "record")?.body).toBe(record.body); expect(result.drafts.find((draft) => draft.key === "record")?.key).toBe("record"); expect(result.drafts.find((draft) => draft.key === "perspective")?.qualityStatus).toBe("repaired");
  });
  it("repairs two failed drafts without sending valid drafts", async () => {
    const p = provider([valid("record", sourceText), { key: "perspective", body: "今天在公园。", usedFacts: [], inferredStatements: [] }, { key: "concise", body: "手酸。", usedFacts: [], inferredStatements: [] }], { perspective: valid("perspective", "最后一直抱着他。"), concise: valid("concise", "一张也没拍。") });
    const result = await run(p);
    expect(p.repairInputs).toHaveLength(2); expect(p.repairInputs.map((input) => input.key)).toEqual(["perspective", "concise"]); expect(p.repairInputs[0].sourceText).toBe(sourceText); expect(result.drafts).toHaveLength(3);
  });
  it("hides a second failed or provider-failed draft while keeping valid drafts", async () => {
    const p = provider([valid("record", sourceText), { key: "perspective", body: "在西湖边手酸。", usedFacts: [], inferredStatements: [] }, valid("concise", "一张也没拍。")], { perspective: new Error("provider failed") });
    const result = await run(p);
    expect(p.repairInputs).toHaveLength(1); expect(result.drafts).toHaveLength(2); expect(result.rejectedDrafts).toEqual([expect.objectContaining({ key: "perspective", qualityStatus: "rejected_for_ungrounded_details" })]); expect(result.retryCount).toBe(1); expect(result.generation.fallback).toBe(false);
  });

  it("sends repair only the grounding contract, never candidate text, voices, IDs, or internal titles", async () => {
    const p = provider([
      valid("record", sourceText),
      { key: "perspective", body: "在西湖边手酸。", usedFacts: [], inferredStatements: [] },
      valid("concise", "一张也没拍。"),
    ], { perspective: valid("perspective", "最后一直抱着他。") });

    await run(p);

    expect(p.repairInputs[0]).toEqual({
      sourceText,
      factAnswers: ["没有更多细节"],
      detailMode: "sparse",
      topic,
      key: "perspective",
      rejectedReasons: expect.any(Array),
    });
    expect(JSON.stringify(p.repairInputs[0])).not.toMatch(/候选正文|VoiceSample|内部标题|数据库|id/i);
  });

  it("tries each rejected type at most once and never falls back", async () => {
    const p = provider([
      valid("record", sourceText),
      { key: "perspective", body: "在西湖边手酸。", usedFacts: [], inferredStatements: [] },
      valid("concise", "一张也没拍。"),
    ], { perspective: { key: "perspective", body: "在公园手酸。", usedFacts: [], inferredStatements: [] } });

    const result = await run(p);

    expect(p.repairInputs).toHaveLength(1);
    expect(result.retryCount).toBe(1);
    expect(result.generation.fallback).toBe(false);
    expect(result.drafts.map((draft) => draft.key)).toEqual(["record", "concise"]);
  });
});
