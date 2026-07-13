"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Candidate = {
  id: string;
  title: string;
  projectName: string;
  platform: string;
};

const platformLabels: Record<string, string> = {
  wechat_moments: "朋友圈",
  x: "X",
  xiaohongshu: "小红书",
  douyin: "抖音",
};

export function PublicationCreateActions({ candidates }: { candidates: Candidate[] }) {
  const router = useRouter();
  const [draftId, setDraftId] = useState(candidates[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function createPackage() {
    setPending(true);
    const response = await fetch("/api/publication", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editorialDraftId: draftId }),
    });
    const result = await response.json() as {
      errors?: string[];
      result?: { package: { id: string }; idempotent: boolean };
    };
    setPending(false);
    if (!response.ok || !result.result) {
      setMessage(result.errors?.join("；") ?? "创建失败");
      return;
    }
    router.push(`/publication/${result.result.package.id}`);
    router.refresh();
  }

  return (
    <section className="mt-8 border border-zinc-300 bg-zinc-50 p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-zinc-500">Approved input</p>
          <h2 className="mt-2 text-base font-semibold text-zinc-950">从已批准稿创建发布包</h2>
          <p className="mt-1 text-sm text-zinc-600">只复制 approved Revision，不改写正文，不触发平台发布。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={draftId}
            onChange={(event) => setDraftId(event.target.value)}
            className="h-10 min-w-72 border border-zinc-300 bg-white px-3 text-sm"
          >
            {candidates.length === 0 && <option value="">暂无可创建的已批准稿</option>}
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.projectName} · {candidate.title} · {platformLabels[candidate.platform]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={createPackage}
            disabled={!draftId || pending}
            className="h-10 bg-zinc-950 px-4 text-sm font-medium text-white disabled:opacity-40"
          >
            {pending ? "创建中…" : "创建发布包"}
          </button>
        </div>
      </div>
      {message && <p className="mt-3 text-sm text-red-700">{message}</p>}
    </section>
  );
}
