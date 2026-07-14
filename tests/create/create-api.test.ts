import { describe, expect, it, vi } from "vitest";

const prismaState = vi.hoisted(() => ({
  voiceSample: {
    findMany: vi.fn(async () => []),
  },
}));

vi.mock("@/lib/prisma", () => ({ getPrisma: () => prismaState }));
vi.mock("@/lib/create/generation-service", async () => import("../../src/lib/create/generation-service"));
vi.mock("@/lib/create/voice-style", async () => import("../../src/lib/create/voice-style"));
vi.mock("@/lib/create/provider-factory", async () => {
  const { LocalFallbackProvider } = await import("../../src/lib/create/provider");
  return { createGenerationProvider: () => new LocalFallbackProvider() };
});

import { POST as generateDrafts } from "../../src/app/api/create/drafts/route";
import { POST as generateTopics } from "../../src/app/api/create/topics/route";

describe("non-persistent create APIs", () => {
  it("returns three topics and rejects empty manual input", async () => {
    const ok = await generateTopics(new Request("http://localhost/api/create/topics", {
      method: "POST",
      body: JSON.stringify({
        sourceMode: "manual",
        sourceText: "最近用 Codex 做了一个内容系统",
        platform: "wechat_moments",
      }),
    }));
    const empty = await generateTopics(new Request("http://localhost/api/create/topics", {
      method: "POST",
      body: JSON.stringify({ sourceMode: "manual", sourceText: "", platform: "wechat_moments" }),
    }));

    expect(ok.status).toBe(200);
    const result = await ok.json();
    expect(result.topics).toHaveLength(3);
    expect(result.brief).toBeTruthy();
    expect(result.generation).toEqual(expect.objectContaining({
      mode: "deterministic_fallback",
      notice: "当前使用本地演示生成，文案可能带有模板感。",
    }));
    expect(empty.status).toBe(400);
  });

  it("returns three drafts using read-only VoiceSample queries", async () => {
    const response = await generateDrafts(new Request("http://localhost/api/create/drafts", {
      method: "POST",
      body: JSON.stringify({
        sourceMode: "manual",
        sourceText: "最近用 Codex 做了一个内容系统",
        platform: "wechat_moments",
        topic: {
          key: "record",
          title: "先把这件事记下来",
          whyWorthWriting: "来自真实输入",
          recommendedAngle: "事情在前",
          platform: "朋友圈",
          missingInformation: "发布前确认",
          sourceBasis: "来自原始输入",
          difference: "只写事情",
        },
        brief: {
          whatHappened: "最近用 Codex 做了一个内容系统",
          concreteDetails: ["最近用 Codex 做了一个内容系统"],
          personalReaction: null,
          tension: null,
          personalJudgment: null,
          unresolvedQuestion: null,
          possibleNextStep: null,
          confirmedFacts: ["最近用 Codex 做了一个内容系统"],
          unverifiedClaims: [],
          prohibitedClaims: [],
          missingContext: [],
          externalReferences: [],
        },
      }),
    }));

    expect(response.status).toBe(200);
    expect((await response.json()).drafts).toHaveLength(3);
    expect(prismaState.voiceSample.findMany).toHaveBeenCalled();
    expect(Object.keys(prismaState.voiceSample)).toEqual(["findMany"]);
  });
});
