import { describe, expect, it } from "vitest";
import { checkDraftSimilarity } from "../../src/lib/create/similarity";

describe("draft similarity guard", () => {
  it("rejects drafts with the same opening, structure and shortened-only content", () => {
    const result = checkDraftSimilarity([
      { key: "record", body: "今天重新打开系统。\n\n功能很多，但问题还没解决。\n\n先回到最初的问题。" },
      { key: "perspective", body: "今天重新打开系统。\n\n功能很多，但问题还没解决。" },
      { key: "concise", body: "今天重新打开系统。\n\n先回到最初的问题。" },
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining(["首句重复", "候选稿只是长短变化"]));
    expect(result.retryKeys.length).toBeGreaterThan(0);
  });

  it("accepts three genuinely different narrative structures", () => {
    const result = checkDraftSimilarity([
      { key: "record", body: "昨天带宝宝出门。\n\n相册里最后还是空的，因为一路都在抱着他。" },
      { key: "perspective", body: "有些时候，顾不上记录就是当时最真实的状态。\n\n昨天出门想拍照，最后一张也没拍。" },
      { key: "concise", body: "想拍很多照片。\n\n最后一直抱着他。\n\n一张也没拍。" },
    ]);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("flags only the draft that uses a banned template phrase", () => {
    const result = checkDraftSimilarity([
      { key: "record", body: "今天重新打开系统。\n\n做到这里才发现，功能多不等于好用。" },
      { key: "perspective", body: "工具能不能每天使用，比功能数量更重要。" },
      { key: "concise", body: "功能越来越多。\n\n最初的问题还在。" },
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues).toContain("候选稿命中禁用模板短语");
    expect(result.retryKeys).toContain("record");
    expect(result.retryKeys).not.toContain("perspective");
  });
});
