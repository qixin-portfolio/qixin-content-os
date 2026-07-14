import { describe, expect, it, vi } from "vitest";

const prismaState = vi.hoisted(() => ({
  voiceProfile: {
    findFirst: vi.fn(async () => null),
  },
  voiceSample: {
    findMany: vi.fn(async () => []),
  },
}));

vi.mock("@/lib/prisma", () => ({ getPrisma: () => prismaState }));
vi.mock("@/lib/create/draft-generator", async () => (
  import("../../src/lib/create/draft-generator")
));
vi.mock("@/lib/create/topic-generator", async () => (
  import("../../src/lib/create/topic-generator")
));
vi.mock("@/lib/editorial/serialization", async () => (
  import("../../src/lib/editorial/serialization")
));

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
    expect((await ok.json()).topics).toHaveLength(3);
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
        },
      }),
    }));

    expect(response.status).toBe(200);
    expect((await response.json()).drafts).toHaveLength(3);
    expect(prismaState.voiceProfile.findFirst).toHaveBeenCalled();
    expect(prismaState.voiceSample.findMany).toHaveBeenCalled();
    expect(Object.keys(prismaState.voiceSample)).toEqual(["findMany"]);
  });
});
