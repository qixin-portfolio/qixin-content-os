"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Master = { id: string; title: string; eventTitle: string };
type Voice = { id: string; name: string; platform: string };

export function EditorialCreateActions({ masters, voices }: { masters: Master[]; voices: Voice[] }) {
  const router = useRouter();
  const [masterId, setMasterId] = useState(masters[0]?.id ?? "");
  const [message, setMessage] = useState("");

  async function createDrafts() {
    const voiceProfileIds = Object.fromEntries(voices.map((voice) => [voice.platform, voice.id]));
    const response = await fetch("/api/editorial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ masterContentId: masterId, voiceProfileIds }) });
    const result = await response.json() as { errors?: string[]; drafts?: unknown[] };
    setMessage(response.ok ? `已准备 ${result.drafts?.length ?? 0} 个平台草稿。` : result.errors?.join("；") ?? "创建失败");
    if (response.ok) router.refresh();
  }

  return (
    <section className="mt-8 border border-zinc-200 p-6">
      <h2 className="text-sm font-semibold text-zinc-950">从母内容准备平台草稿</h2>
      <p className="mt-2 text-sm text-zinc-600">只生成待审核 EditorialDraft，不会发布，也不会修改 MasterContent。</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><select value={masterId} onChange={(event) => setMasterId(event.target.value)} className="h-10 border border-zinc-300 bg-white px-3 text-sm">{masters.map((master) => <option key={master.id} value={master.id}>{master.eventTitle} · {master.title}</option>)}</select><p className="border border-zinc-200 px-3 py-2 text-sm text-zinc-600">按平台使用默认 VoiceProfile：{voices.map((voice) => `${voice.platform}=${voice.name}`).join("；")}</p></div>
      <button type="button" onClick={createDrafts} disabled={!masterId || voices.length < 4} className="mt-4 bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">准备四个平台草稿</button>
      {message && <p className="mt-3 text-sm text-zinc-600">{message}</p>}
    </section>
  );
}
