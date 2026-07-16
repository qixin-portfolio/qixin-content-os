import { describe, expect, it } from "vitest";
import {
  normalizeDraftEnvelope,
  normalizeDraftItem,
  normalizeTopicEnvelope,
  parseStructuredJson,
} from "../../src/lib/create/structured-output";

const threeTopics = [
  {
    title: "事情发生了什么",
    focus: "只写具体变化",
    whyWorthWriting: "有真实变化",
    angle: "从发生顺序进入",
    platform: "wechat_moments",
    missingInformation: [],
    sourceGrounding: ["原始输入中的变化"],
  },
  {
    title: "判断怎么变化",
    focus: "写个人判断",
    whyWorthWriting: "判断来自经历",
    angle: "先判断再用事情支撑",
    platform: "wechat_moments",
    missingInformation: [],
    sourceGrounding: ["原始输入中的判断"],
  },
  {
    title: "停在没做完",
    focus: "保留未完成",
    whyWorthWriting: "不强行总结",
    angle: "只留必要事实",
    platform: "wechat_moments",
    missingInformation: [],
    sourceGrounding: ["原始输入中的未完成状态"],
  },
];

function minimalTopic(topic: (typeof threeTopics)[number]) {
  return {
    title: topic.title,
    focus: topic.focus,
    whyWorthWriting: topic.whyWorthWriting,
    angle: topic.angle,
    missingInformation: topic.missingInformation,
    sourceGrounding: topic.sourceGrounding,
  };
}

const topicEnvelope = { topics: threeTopics.map(minimalTopic) };

describe("Ark structured output", () => {
  it("parses direct JSON", () => {
    expect(parseStructuredJson(JSON.stringify(topicEnvelope))).toEqual(topicEnvelope);
  });

  it("parses JSON wrapped by one Markdown fence", () => {
    expect(parseStructuredJson(`\n\`\`\`json\n${JSON.stringify(topicEnvelope)}\n\`\`\`\n`)).toEqual(topicEnvelope);
  });

  it("rejects extra explanation outside JSON", () => {
    expect(() => parseStructuredJson(`下面是结果：\n${JSON.stringify(topicEnvelope)}`))
      .toThrow(expect.objectContaining({ code: "schema_validation_failed" }));
  });

  it("normalizes nulls and safe string arrays in topics", () => {
    const normalized = normalizeTopicEnvelope({
      topics: threeTopics.map((topic) => ({
        ...minimalTopic(topic),
        missingInformation: null,
        sourceGrounding: topic.sourceGrounding[0],
      })),
    });

    expect(normalized.topics[0].missingInformation).toEqual([]);
    expect(normalized.topics[0].sourceGrounding).toEqual(["原始输入中的变化"]);
  });

  it("accepts a minimal topics-only envelope with exactly three topics", () => {
    const normalized = normalizeTopicEnvelope({
      topics: threeTopics.map(minimalTopic),
    });

    expect(normalized.topics).toHaveLength(3);
    expect("brief" in normalized).toBe(false);
  });

  it("rejects a topics-only envelope with the wrong topic count", () => {
    expect(() => normalizeTopicEnvelope({
      topics: threeTopics.slice(0, 2).map(minimalTopic),
    })).toThrow(expect.objectContaining({ code: "schema_validation_failed" }));
  });

  it("normalizes one response containing exactly three draft types", () => {
    const result = normalizeDraftEnvelope({
      drafts: [
        { type: "scene_record", content: "事情。", approachDescription: "从事情开始", groundedFacts: "事情", unresolvedClaims: null },
        { type: "thought_progression", content: "判断。", approachDescription: "从判断开始", groundedFacts: [], unresolvedClaims: [] },
        { type: "restrained_short", content: "停在这里。", approachDescription: "克制留白", groundedFacts: [], unresolvedClaims: [] },
      ],
    });

    expect(result.drafts.map((draft) => draft.type)).toEqual(["scene_record", "thought_progression", "restrained_short"]);
    expect(result.drafts[0].groundedFacts).toEqual(["事情"]);
    expect(result.drafts[0].unresolvedClaims).toEqual([]);
  });

  it("normalizes a single repeated-version repair without changing its content", () => {
    expect(normalizeDraftItem({
      type: "restrained_short",
      content: "  只留这一句。  ",
      approachDescription: "克制留白",
      groundedFacts: "只留这一句",
      unresolvedClaims: null,
    })).toEqual({
      type: "restrained_short",
      content: "只留这一句。",
      approachDescription: "克制留白",
      groundedFacts: ["只留这一句"],
      unresolvedClaims: [],
      usedFacts: [],
      inferredStatements: [],
    });
  });
});
