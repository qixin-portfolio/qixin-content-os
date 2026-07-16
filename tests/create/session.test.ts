import { describe, expect, it } from "vitest";
import {
  CREATE_SESSION_KEY,
  clearCreateSession,
  copyCreateBody,
  createEmptySession,
  loadCreateSession,
  saveCreateSession,
  selectDraftForEditing,
  updateEditedContent,
} from "../../src/lib/create/session";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

const candidate = {
  key: "record" as const,
  name: "真实记录版" as const,
  body: "候选正文",
  difference: "先记录事实。",
  lightweightWarnings: ["这部分来自你的临时输入，发布前请确认准确。"],
  assetSuggestions: ["当前没有配图也可以只发文字。"],
  safety: {
    sourceSummary: "手动输入：今天发生了一件事",
    unconfirmedFacts: ["发布前确认临时输入准确。"],
    privacyRisks: ["如配图，请检查私人信息。"],
    imageNotes: ["当前没有配图也可以只发文字。"],
  },
};

describe("local create session", () => {
  it("uses a versioned key and restores the complete session after refresh", () => {
    const storage = memoryStorage();
    const session = updateEditedContent(
      selectDraftForEditing(createEmptySession("2026-07-14T10:00:00.000Z"), candidate),
      "人工修改后的正文",
      "2026-07-14T10:01:00.000Z",
    );

    expect(CREATE_SESSION_KEY).toBe("qixin-content-os:create-session:v1");
    expect(saveCreateSession(storage, session)).toEqual({ ok: true });
    expect(loadCreateSession(storage)).toEqual({ session, restored: true, error: null });
  });

  it("restores a fact-enrichment session while it is waiting for details", () => {
    const storage = memoryStorage();
    const session = {
      ...createEmptySession("2026-07-16T10:00:00.000Z"),
      currentStep: "details" as const,
      factQuestions: ["发生在哪里？", "有什么画面？"],
      factAnswers: ["", "一直抱着他"],
      detailMode: "enriched" as const,
    };

    saveCreateSession(storage, session);
    expect(loadCreateSession(storage)).toEqual({ session, restored: true, error: null });
  });

  it("migrates an older local session without discarding its manual editor content", () => {
    const storage = memoryStorage();
    const current = updateEditedContent(selectDraftForEditing(createEmptySession("2026-07-15T10:00:00.000Z"), candidate), "旧版人工修改正文");
    const legacySession: Record<string, unknown> = { ...current };
    delete legacySession.factQuestions;
    delete legacySession.factAnswers;
    delete legacySession.detailMode;

    storage.setItem(CREATE_SESSION_KEY, JSON.stringify(legacySession));

    expect(loadCreateSession(storage)).toEqual({
      session: { ...current, factQuestions: [], factAnswers: [], detailMode: null },
      restored: true,
      error: null,
    });
  });

  it("safely falls back when local JSON is damaged or has another version", () => {
    const damaged = memoryStorage();
    damaged.setItem(CREATE_SESSION_KEY, "{not-json");
    expect(loadCreateSession(damaged).restored).toBe(false);
    expect(loadCreateSession(damaged).error).toBeTruthy();

    const wrongVersion = memoryStorage();
    wrongVersion.setItem(CREATE_SESSION_KEY, JSON.stringify({ version: 2 }));
    expect(loadCreateSession(wrongVersion).restored).toBe(false);
    expect(loadCreateSession(wrongVersion).error).toBeTruthy();
  });

  it("keeps manual edits separate from candidate text and clears only local state", () => {
    const storage = memoryStorage();
    const selected = selectDraftForEditing(createEmptySession(), candidate);
    const edited = updateEditedContent(selected, "只保留人工正文");

    expect(edited.selectedDraft?.body).toBe("候选正文");
    expect(edited.editedContent).toBe("只保留人工正文");
    saveCreateSession(storage, edited);
    clearCreateSession(storage);
    expect(storage.getItem(CREATE_SESSION_KEY)).toBeNull();
  });

  it("keeps local input and manual edits when a provider timeout is reported", () => {
    const storage = memoryStorage();
    const session = {
      ...updateEditedContent(createEmptySession(), "人工正文"),
      sourceMode: "manual" as const,
      manualInput: "仍要保留的原始输入",
    };
    saveCreateSession(storage, session);

    const restored = loadCreateSession(storage);
    expect(restored.session.manualInput).toBe("仍要保留的原始输入");
    expect(restored.session.editedContent).toBe("人工正文");
  });

  it("copies only the final editor body and reports clipboard failure", async () => {
    let copied = "";
    const clipboard = { writeText: async (value: string) => { copied = value; } };

    await expect(copyCreateBody(clipboard, "最终正文")).resolves.toEqual({ ok: true });
    expect(copied).toBe("最终正文");
    expect(copied).not.toContain("来源与安全检查");

    await expect(copyCreateBody({ writeText: async () => { throw new Error("denied"); } }, "最终正文"))
      .resolves.toEqual({ ok: false, error: "浏览器不允许剪贴板操作，请手动选择正文复制。" });
  });
});
