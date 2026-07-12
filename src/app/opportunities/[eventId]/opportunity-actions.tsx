"use client";

import { useState } from "react";

type Angle = { id: string; title: string; angleType: string; recommendedPlatformsJson: string };
type Voice = { id: string; name: string; platform: string };

export function OpportunityActions({ eventId, angles, voices, existingMaster }: { eventId: string; angles: Angle[]; voices: Voice[]; existingMaster: boolean }) {
  const [angleId, setAngleId] = useState(angles[0]?.id ?? "");
  const [voiceId, setVoiceId] = useState(voices[0]?.id ?? "");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<{ title: string; hook: string; story: string; insight: string; reflection: string; cta: string; factReferences: string[] } | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/opportunities/${eventId}/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ angleId, voiceProfileId: voiceId }) });
    const result = await response.json() as { errors?: string[]; draft?: typeof draft };
    if (!response.ok) setError(result.errors?.join("；") ?? "生成失败");
    else if (result.draft) setDraft(result.draft);
    setLoading(false);
  }

  return (
    <div className="mt-8 border-t border-zinc-200 pt-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block"><span className="text-sm font-medium text-zinc-800">选择内容角度</span><select value={angleId} onChange={(event) => setAngleId(event.target.value)} className="mt-2 block h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm">{angles.map((angle) => <option key={angle.id} value={angle.id}>{angle.title}</option>)}</select></label>
        <label className="block"><span className="text-sm font-medium text-zinc-800">选择 VoiceProfile</span><select value={voiceId} onChange={(event) => setVoiceId(event.target.value)} className="mt-2 block h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm">{voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name} · {voice.platform}</option>)}</select></label>
      </div>
      <button type="button" onClick={generate} disabled={loading || existingMaster || !angleId || !voiceId} className="mt-5 rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50">{existingMaster ? "已有母内容，未覆盖" : loading ? "生成中..." : "生成 MasterContent draft"}</button>
      {error && <p role="alert" className="mt-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {draft && <div className="mt-6 space-y-4 border border-zinc-200 p-5"><h3 className="text-lg font-semibold text-zinc-950">{draft.title}</h3><p className="text-sm font-medium text-zinc-800">{draft.hook}</p><div className="whitespace-pre-wrap text-sm leading-7 text-zinc-700">{draft.story}</div><div className="whitespace-pre-wrap text-sm leading-7 text-zinc-700">{draft.insight}</div><p className="text-sm leading-7 text-zinc-700">{draft.reflection}</p><p className="text-sm text-zinc-600">{draft.cta}</p><p className="font-mono text-xs text-zinc-500">SourceItem IDs: {draft.factReferences.join(", ")}</p></div>}
    </div>
  );
}
