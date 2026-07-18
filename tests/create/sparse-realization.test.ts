import { describe, expect, it } from "vitest";
import {
  buildSparseRealizationPlan,
  checkSparseDraftRealization,
} from "../../src/lib/create/sparse-realization.ts";

const rawInput = "今天在外面出差，没法打开 Content OS，但突然发现微信才应该是我真正的入口。";

describe("sparse constrained realization", () => {
  it("extracts immutable event, product, entry, and user conclusion without adding facts", () => {
    const plan = buildSparseRealizationPlan(rawInput);

    expect(plan.immutableFacts).toEqual(expect.arrayContaining([
      "今天在外面出差",
      "没法打开 Content OS",
      "微信",
    ]));
    expect(plan.userConclusions).toEqual(expect.arrayContaining(["微信才应该是我真正的入口"]));
    expect(plan.allowedInferences).toEqual(expect.arrayContaining([
      "Content OS 应更重视微信入口",
      "工具是否好用也取决于需要时能否马上访问",
    ]));
    expect(plan.forbiddenAdditions).toEqual(expect.arrayContaining(["执行公务", "指定系统", "核心连接渠道"]));
  });

  it("rejects occupation-like rewrites, abstraction replacements, and report language in a record", () => {
    const issues = checkSparseDraftRealization({
      key: "record",
      body: "今天外出执行公务时，我没办法打开 Content OS，却忽然察觉微信是 Content OS 的核心连接渠道。这种临时无法访问指定系统的状况，让我直观感知到办公场景里工具适配的关键作用。",
      plan: buildSparseRealizationPlan(rawInput),
    });

    expect(issues).toEqual(expect.arrayContaining([
      "unsupported_fact: 执行公务",
      "abstraction_replacement",
      "report_language",
    ]));
  });

  it("rejects invented habitual claims and abstract scenario labels", () => {
    const issues = checkSparseDraftRealization({
      key: "record",
      body: "今天在外面出差，没办法打开 Content OS。我才发现微信才应该是我真正的入口，不是原本常用的 Content OS 入口逻辑，而是适配外出场景的微信。",
      plan: buildSparseRealizationPlan(rawInput),
    });

    expect(issues).toEqual(expect.arrayContaining([
      "unsupported_fact: habitual_claim",
      "report_language",
    ]));
  });

  it("rejects a comparison that treats an entry and a tool as interchangeable roles", () => {
    const issues = checkSparseDraftRealization({
      key: "record",
      body: "今天在外面出差，没法打开 Content OS。我才发现微信才是我真正的入口，不是没法使用的工具，而是能直接使用的入口。",
      plan: buildSparseRealizationPlan(rawInput),
    });

    expect(issues).toContain("concept_role_confusion");
  });

  it("rejects occupational and scenario labels absent from the original facts", () => {
    const issues = checkSparseDraftRealization({
      key: "perspective",
      body: "我判断选办公相关的入口时，不只看它能不能实现功能，还要看需要的时候能不能马上用。我判断 Content OS 可以把微信设为入口，这样能适配外出的情况。",
      plan: buildSparseRealizationPlan(rawInput),
    });

    expect(issues).toEqual(expect.arrayContaining([
      "abstraction_replacement",
      "report_language",
    ]));
  });

  it("rejects a record that rewrites the system as a supporting path", () => {
    const issues = checkSparseDraftRealization({
      key: "record",
      body: "今天在外面出差，没法打开 Content OS。我才发现微信才应该是我真正的入口，不是没法打开的 Content OS 配套路径，而是随取随用的微信。",
      plan: buildSparseRealizationPlan(rawInput),
    });

    expect(issues).toContain("concept_role_confusion");
  });

  it("rejects generic-system substitutions and tool-entry role confusion with filler words", () => {
    const issues = checkSparseDraftRealization({
      key: "record",
      body: "今天在外面出差，没办法打开 Content OS。我才发现微信才应该是我真正的入口，不是只能依赖指定的系统入口，而是能在当下直接使用的工具才是合适的入口。",
      plan: buildSparseRealizationPlan(rawInput),
    });

    expect(issues).toEqual(expect.arrayContaining([
      "abstraction_replacement",
      "concept_role_confusion",
    ]));
  });

  it("rejects an entry compared against invented environment and tool categories", () => {
    const issues = checkSparseDraftRealization({
      key: "record",
      body: "今天在外面出差，我没法打开 Content OS。我才发现微信才应该是我真正的入口，不是只能靠固定环境才能访问的系统，而是能随时用到的工具。",
      plan: buildSparseRealizationPlan(rawInput),
    });

    expect(issues).toEqual(expect.arrayContaining([
      "abstraction_replacement",
      "concept_role_confusion",
    ]));
  });

  it("rejects an entry that treats the source system as its alternative", () => {
    const issues = checkSparseDraftRealization({
      key: "record",
      body: "今天在外面出差，没办法打开 Content OS。我才发现微信才是我真正的入口，不是不能用的 Content OS，而是随时能用的微信。",
      plan: buildSparseRealizationPlan(rawInput),
    });

    expect(issues).toContain("concept_role_confusion");
  });

  it("allows original fact phrases in a record without requiring abstract rewrites", () => {
    const issues = checkSparseDraftRealization({
      key: "record",
      body: "今天人在外面出差，没法打开 Content OS。也是这个时候我才发现，对我来说，微信可能比网页更适合作为内容工作流的入口。",
      plan: buildSparseRealizationPlan(rawInput),
    });

    expect(issues).toEqual([]);
  });

  it("requires the judgment to retain product, entry, and event anchors", () => {
    const issues = checkSparseDraftRealization({
      key: "perspective",
      body: "我不只看能不能打开 Content OS 本身，还要看有没有能访问它的便捷路径。我不只看工具的官方设定，还要看实际能用的操作方式。",
      plan: buildSparseRealizationPlan(rawInput),
    });

    expect(issues).toEqual(expect.arrayContaining([
      "missing_event_anchor",
      "missing_wechat_anchor",
      "generic_statement",
      "semantic_repetition",
    ]));
  });

  it("accepts a concise conclusion that preserves the system-entry relationship", () => {
    const issues = checkSparseDraftRealization({
      key: "concise",
      body: "Content OS 真正的入口，应该是微信。",
      plan: buildSparseRealizationPlan(rawInput),
    });

    expect(issues).toEqual([]);
  });
});
