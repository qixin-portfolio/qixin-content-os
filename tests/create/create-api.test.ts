import { describe, expect, it, vi } from "vitest";

const prismaState = vi.hoisted(() => ({
  voiceSample: {
    findMany: vi.fn(async () => []),
  },
}));
const providerState = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));

vi.mock("@/lib/prisma", () => ({ getPrisma: () => prismaState }));
vi.mock("@/lib/create/generation-service", async () => import("../../src/lib/create/generation-service"));
vi.mock("@/lib/create/provider", async () => import("../../src/lib/create/provider"));
vi.mock("@/lib/create/voice-style", async () => import("../../src/lib/create/voice-style"));
vi.mock("@/lib/create/provider-factory", async () => {
  const { LocalFallbackProvider } = await import("../../src/lib/create/provider");
  return { createGenerationProvider: () => providerState.current ?? new LocalFallbackProvider() };
});

import { maxDuration as draftsMaxDuration, POST as generateDrafts } from "../../src/app/api/create/drafts/route";
import { maxDuration as topicsMaxDuration, POST as generateTopics } from "../../src/app/api/create/topics/route";

describe("non-persistent create APIs", () => {
  it("keeps the route ceiling above the Ark provider timeout", () => {
    expect(topicsMaxDuration).toBe(75);
    expect(draftsMaxDuration).toBe(75);
  });

  it("returns three topics and rejects empty manual input", async () => {
    providerState.current = null;
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
    expect(result.brief).toBeUndefined();
    expect(result.lightweightWarnings.length).toBeGreaterThan(0);
    expect(result.generation).toEqual(expect.objectContaining({
      mode: "deterministic_fallback",
      notice: "本地演示内容可能带有模板感，不代表真实模型效果。",
    }));
    expect(empty.status).toBe(400);
  });

  it("returns three drafts using read-only VoiceSample queries", async () => {
    providerState.current = null;
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
      }),
    }));

    expect(response.status).toBe(200);
    expect((await response.json()).drafts).toHaveLength(3);
    expect(prismaState.voiceSample.findMany).toHaveBeenCalled();
    expect(Object.keys(prismaState.voiceSample)).toEqual(["findMany"]);
  });

  it("returns schema failures without automatic fallback", async () => {
    const { CreateProviderError } = await import("../../src/lib/create/provider");
    let modelCalls = 0;
    providerState.current = {
      id: "volcengine_ark",
      mode: "model",
      async createTopics() {
        modelCalls += 1;
        throw new CreateProviderError("schema_validation_failed", "真实模型返回格式不完整，请重试。");
      },
    };

    const response = await generateTopics(new Request("http://localhost/api/create/topics", {
      method: "POST",
      body: JSON.stringify({ sourceMode: "manual", sourceText: "今天打开系统", platform: "wechat_moments" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual(expect.objectContaining({
      classification: "schema_validation_failed",
      fallback: false,
      localFallbackAvailable: true,
    }));
    expect(modelCalls).toBe(1);
  });

  it("uses deterministic fallback only after an explicit local-demo request", async () => {
    let modelCalls = 0;
    providerState.current = {
      id: "volcengine_ark",
      mode: "model",
      async createTopics() {
        modelCalls += 1;
        throw new Error("model should not be called");
      },
    };

    const response = await generateTopics(new Request("http://localhost/api/create/topics", {
      method: "POST",
      headers: { "x-use-local-demo": "true" },
      body: JSON.stringify({ sourceMode: "manual", sourceText: "今天打开系统", platform: "wechat_moments" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.generation).toEqual(expect.objectContaining({
      provider: "deterministic_fallback",
      fallback: true,
    }));
    expect(modelCalls).toBe(0);
  });
});
