import { describe, expect, it, vi } from "vitest";
import { createGenerationProvider } from "../../src/lib/create/provider-factory";
import { VolcengineArkCreateProvider } from "../../src/lib/create/volcengine-ark-provider";

describe("Volcengine Ark provider selection", () => {
  it("uses deterministic fallback unless both Ark values exist", () => {
    const environment = (values: Record<string, string>) => ({ NODE_ENV: "test", ...values }) as unknown as NodeJS.ProcessEnv;
    expect(createGenerationProvider(environment({})).id).toBe("deterministic_fallback");
    expect(createGenerationProvider(environment({ ARK_API_KEY: "key-only" })).id).toBe("deterministic_fallback");
    expect(createGenerationProvider(environment({ ARK_API_KEY: "key", ARK_MODEL_ID: "ep-real-id" })).id).toBe("volcengine_ark");
  });

  it("sends the configured endpoint ID to the official Chat API using mock fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      const brief = {
        whatHappened: "今天打开系统",
        concreteDetails: ["今天打开系统"],
        personalReaction: null,
        tension: null,
        personalJudgment: null,
        unresolvedQuestion: null,
        possibleNextStep: null,
        confirmedFacts: ["今天打开系统"],
        unverifiedClaims: [],
        prohibitedClaims: [],
        missingContext: [],
        externalReferences: [],
      };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(brief) } }] }), { status: 200 });
    });
    const provider = new VolcengineArkCreateProvider("test-server-key", "ep-real-id", fetchMock as typeof fetch);

    await provider.createBrief({ sourceMode: "manual", sourceText: "今天打开系统", platform: "wechat_moments" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://ark.cn-beijing.volces.com/api/v3/chat/completions");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("ep-real-id");
    expect(body.model).not.toBe("doubao-2.1");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer test-server-key");
  });
});
