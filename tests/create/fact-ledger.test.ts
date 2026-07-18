import { describe, expect, it } from "vitest";
import { createFactLedger, projectAccessClaimIssues } from "../../src/lib/create/fact-ledger";

describe("request-scoped fact ledger", () => {
  it("uses only conservatively split raw input and fact answers with stable request IDs", () => {
    const input = {
      rawInput: "昨天带宝宝出门。最后一直抱着他，一张也没拍。",
      factAnswers: ["西湖边", ""],
      sourceMode: "manual" as const,
    };

    const first = createFactLedger(input);
    const second = createFactLedger(input);

    expect(first).toEqual(second);
    expect(first.facts).toEqual([
      expect.objectContaining({ id: "F1", text: "昨天带宝宝出门", sourceType: "raw_input" }),
      expect.objectContaining({ id: "F2", text: "最后一直抱着他，一张也没拍", sourceType: "raw_input" }),
      expect.objectContaining({ id: "F3", text: "西湖边", sourceType: "fact_answer" }),
    ]);
    expect(first.facts.map((fact) => fact.text).join("\n")).not.toContain("照片");
  });

  it("marks external opinions and user judgments without asking a model to split them", () => {
    const ledger = createFactLedger({
      rawInput: "我看到一个观点，说 AI 会放大人的认知差距。这是别人的观点，我想到的是自己最近做 Content OS 的经历。",
      factAnswers: [],
      sourceMode: "manual",
    });

    expect(ledger.facts[0]).toEqual(expect.objectContaining({ sourceType: "external_opinion", category: "external_claim" }));
    expect(ledger.facts[1]).toEqual(expect.objectContaining({ sourceType: "user_judgment", category: "user_judgment" }));
  });

  it("preserves external attribution and personal judgment when they arrive as detail answers", () => {
    const ledger = createFactLedger({
      rawInput: "我最近做 Content OS。",
      factAnswers: ["观点来自 X 收藏的外部长文，不是齐鑫原创。", "真正想要的是打开工具后直接知道今天有什么值得写。"],
      sourceMode: "manual",
    });

    expect(ledger.facts[1]).toEqual(expect.objectContaining({ sourceType: "external_opinion", category: "external_claim" }));
    expect(ledger.facts[2]).toEqual(expect.objectContaining({ sourceType: "user_judgment", category: "user_judgment" }));
  });

  it("separates a user-provided existing project from an unverified request to read it", () => {
    const ledger = createFactLedger({
      rawInput: "我已经有相关项目在做。",
      factAnswers: [],
      sourceMode: "manual",
      unverifiedRequests: ["用户希望系统读取项目资料"],
    });

    expect(ledger.facts).toEqual([
      expect.objectContaining({ text: "我已经有相关项目在做", sourceStatus: "user_provided" }),
    ]);
    expect(ledger.unverifiedRequests).toEqual([
      { text: "用户希望系统读取项目资料", sourceStatus: "unverified_request" },
    ]);
    expect(ledger.facts.some((fact) => fact.sourceStatus === "authorized_project_source")).toBe(false);
  });

  it("rejects project-access claims until an authorized project source exists", () => {
    const ledger = createFactLedger({ rawInput: "我已经有相关项目在做。", factAnswers: [], sourceMode: "manual" });
    const oldDrafts = [
      "另外我 codex 已经有相关项目在做了，可以读取资料查看。",
      "且已有 codex 相关项目可参考。",
      "codex 有相关项目可看。",
    ];

    expect(projectAccessClaimIssues(oldDrafts, ledger)).toEqual(["unsupported_project_access_claim"]);
    expect(projectAccessClaimIssues(oldDrafts, {
      ...ledger,
      facts: [...ledger.facts, { id: "F2", text: "授权项目文档摘要", sourceType: "raw_input", sourceStatus: "authorized_project_source", category: "project_state" }],
    })).toEqual([]);
  });
});
