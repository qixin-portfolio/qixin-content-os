"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type VoiceProfile = { id: string; name: string; platform: string };

export function SampleActions({ profiles }: { profiles: VoiceProfile[] }) {
  const router = useRouter();
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [platform, setPlatform] = useState(profiles[0]?.platform ?? "wechat_moments");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rating, setRating] = useState("5");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");

  async function createSample() {
    const response = await fetch("/api/voice/samples", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceProfileId: profileId, platform, title, body, qualityRating: Number(rating), notes }),
    });
    const result = await response.json() as { errors?: string[] };
    setMessage(response.ok ? "已保存本人文案样本。" : result.errors?.join("；") ?? "保存失败");
    if (response.ok) {
      setTitle("");
      setBody("");
      setNotes("");
      router.refresh();
    }
  }

  return (
    <section className="mt-8 border border-zinc-200 p-6">
      <h2 className="text-sm font-semibold text-zinc-950">手动添加本人文案</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">只保存你确认像自己的真实文案，不把 AI 草稿自动当作样本。</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-zinc-700">VoiceProfile<select value={profileId} onChange={(event) => setProfileId(event.target.value)} className="mt-1 block h-10 w-full border border-zinc-300 bg-white px-3">{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
        <label className="text-sm text-zinc-700">平台<select value={platform} onChange={(event) => setPlatform(event.target.value)} className="mt-1 block h-10 w-full border border-zinc-300 bg-white px-3"><option value="wechat_moments">朋友圈</option><option value="x">X</option><option value="xiaohongshu">小红书</option><option value="douyin">抖音</option></select></label>
        <label className="text-sm text-zinc-700">标题<input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 block h-10 w-full border border-zinc-300 px-3" /></label>
        <label className="text-sm text-zinc-700">质量评分<select value={rating} onChange={(event) => setRating(event.target.value)} className="mt-1 block h-10 w-full border border-zinc-300 bg-white px-3">{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}/5</option>)}</select></label>
      </div>
      <label className="mt-4 block text-sm text-zinc-700">正文<textarea value={body} onChange={(event) => setBody(event.target.value)} rows={7} className="mt-1 block w-full border border-zinc-300 px-3 py-2" /></label>
      <label className="mt-4 block text-sm text-zinc-700">为什么像本人<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mt-1 block w-full border border-zinc-300 px-3 py-2" /></label>
      <button type="button" onClick={createSample} disabled={!profileId || !title.trim() || !body.trim()} className="mt-4 bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">保存样本</button>
      {message && <p className="mt-3 text-sm text-zinc-600">{message}</p>}
    </section>
  );
}
