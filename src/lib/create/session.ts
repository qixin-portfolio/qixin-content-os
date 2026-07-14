import type { CreateDraftCandidate, CreateSession } from "./types";

export const CREATE_SESSION_KEY = "qixin-content-os:create-session:v1";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type ClipboardLike = Pick<Clipboard, "writeText">;

function nowIso() {
  return new Date().toISOString();
}

export function createEmptySession(updatedAt = nowIso()): CreateSession {
  return {
    version: 1,
    sourceMode: null,
    manualInput: "",
    selectedProject: null,
    topicCandidates: [],
    selectedTopic: null,
    draftCandidates: [],
    selectedDraft: null,
    editedContent: "",
    lightweightWarnings: [],
    assetSuggestions: [],
    currentStep: "source",
    updatedAt,
  };
}

function isCreateSession(value: unknown): value is CreateSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<CreateSession>;
  return session.version === 1
    && typeof session.manualInput === "string"
    && Array.isArray(session.topicCandidates)
    && Array.isArray(session.draftCandidates)
    && typeof session.editedContent === "string"
    && Array.isArray(session.lightweightWarnings)
    && Array.isArray(session.assetSuggestions)
    && ["source", "topics", "drafts", "editor"].includes(session.currentStep ?? "")
    && typeof session.updatedAt === "string";
}

export function loadCreateSession(storage: StorageLike): {
  session: CreateSession;
  restored: boolean;
  error: string | null;
} {
  const raw = storage.getItem(CREATE_SESSION_KEY);
  if (!raw) return { session: createEmptySession(), restored: false, error: null };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isCreateSession(parsed)) {
      return {
        session: createEmptySession(),
        restored: false,
        error: "本地草稿版本不兼容，已为你打开新创作。",
      };
    }
    return { session: parsed, restored: true, error: null };
  } catch {
    return {
      session: createEmptySession(),
      restored: false,
      error: "本地草稿恢复失败，已为你打开新创作。",
    };
  }
}

export function saveCreateSession(storage: StorageLike, session: CreateSession) {
  try {
    storage.setItem(CREATE_SESSION_KEY, JSON.stringify(session));
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "无法自动保存，请先复制当前文案。" };
  }
}

export function clearCreateSession(storage: StorageLike) {
  storage.removeItem(CREATE_SESSION_KEY);
}

export async function copyCreateBody(clipboard: ClipboardLike, body: string) {
  try {
    await clipboard.writeText(body);
    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      error: "浏览器不允许剪贴板操作，请手动选择正文复制。",
    };
  }
}

export function selectDraftForEditing(
  session: CreateSession,
  draft: CreateDraftCandidate,
  updatedAt = nowIso(),
): CreateSession {
  return {
    ...session,
    selectedDraft: draft,
    editedContent: draft.body,
    lightweightWarnings: draft.lightweightWarnings.slice(0, 3),
    assetSuggestions: draft.assetSuggestions,
    currentStep: "editor",
    updatedAt,
  };
}

export function updateEditedContent(
  session: CreateSession,
  editedContent: string,
  updatedAt = nowIso(),
): CreateSession {
  return { ...session, editedContent, updatedAt };
}
