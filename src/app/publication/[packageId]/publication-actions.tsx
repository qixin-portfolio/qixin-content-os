"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ManualItem = { id: string; label: string; completed: boolean };

export function PublicationActions({
  packageId,
  finalCopy,
  manualItems,
}: {
  packageId: string;
  finalCopy: string;
  manualItems: ManualItem[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => new Set(manualItems.filter(({ completed }) => completed).map(({ id }) => id)));
  const [publishedAt, setPublishedAt] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");
  const [publishNotes, setPublishNotes] = useState("");
  const [message, setMessage] = useState("");

  async function copyText() {
    await navigator.clipboard.writeText(finalCopy);
    setMessage("最终文案已复制。未执行平台发布。");
  }

  async function download(format: "txt" | "markdown" | "json") {
    const response = await fetch(`/api/publication/${packageId}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format }),
    });
    if (!response.ok) {
      const result = await response.json() as { errors?: string[] };
      setMessage(result.errors?.join("；") ?? "导出失败");
      return;
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? `publication.${format}`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(`${fileName} 已导出，并写入导出记录。`);
    router.refresh();
  }

  async function saveChecklist() {
    const response = await fetch(`/api/publication/${packageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_checklist", completedItemIds: [...selected] }),
    });
    const result = await response.json() as { errors?: string[] };
    setMessage(response.ok ? "人工检查单已保存。" : result.errors?.join("；") ?? "保存失败");
    if (response.ok) router.refresh();
  }

  async function setStatus(status: "published" | "archived") {
    const response = await fetch(`/api/publication/${packageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_status",
        status,
        publishedAt: status === "published" && publishedAt ? new Date(publishedAt).toISOString() : undefined,
        publishedUrl: publishedUrl || undefined,
        publishNotes: publishNotes || undefined,
      }),
    });
    const result = await response.json() as { errors?: string[] };
    setMessage(response.ok
      ? status === "published" ? "已人工记录为 published。" : "发布包已归档。"
      : result.errors?.join("；") ?? "状态更新失败");
    if (response.ok) router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copyText} className="bg-zinc-950 px-3 py-2 text-sm font-medium text-white">复制最终文案</button>
        {(["txt", "markdown", "json"] as const).map((format) => (
          <button key={format} type="button" onClick={() => download(format)} className="border border-zinc-300 bg-white px-3 py-2 font-mono text-xs uppercase">导出 {format === "markdown" ? "MD" : format}</button>
        ))}
      </div>

      <div className="mt-5 border-t border-zinc-200 pt-5">
        <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Manual checks</p>
        <div className="mt-3 space-y-3">
          {manualItems.map((item) => (
            <label key={item.id} className="flex gap-3 text-sm leading-5 text-zinc-800">
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={(event) => setSelected((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(item.id); else next.delete(item.id);
                  return next;
                })}
                className="mt-0.5 size-4"
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
        <button type="button" onClick={saveChecklist} className="mt-4 border border-zinc-400 px-3 py-2 text-sm font-medium">保存人工检查</button>
      </div>

      <div className="mt-5 border-t border-zinc-200 pt-5">
        <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Manual publication record</p>
        <label className="mt-3 block text-sm text-zinc-700">发布时间（必填）<input type="datetime-local" value={publishedAt} onChange={(event) => setPublishedAt(event.target.value)} className="mt-1 block h-10 w-full border border-zinc-300 px-3" /></label>
        <label className="mt-3 block text-sm text-zinc-700">公开 URL（朋友圈可空）<input value={publishedUrl} onChange={(event) => setPublishedUrl(event.target.value)} className="mt-1 block h-10 w-full border border-zinc-300 px-3" /></label>
        <label className="mt-3 block text-sm text-zinc-700">发布备注（可空）<textarea value={publishNotes} onChange={(event) => setPublishNotes(event.target.value)} rows={3} className="mt-1 block w-full border border-zinc-300 px-3 py-2" /></label>
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => setStatus("published")} className="bg-zinc-950 px-3 py-2 text-sm font-medium text-white">人工标记 published</button><button type="button" onClick={() => setStatus("archived")} className="border border-zinc-300 px-3 py-2 text-sm">归档</button></div>
        <p className="mt-3 text-xs leading-5 text-zinc-500">这里只记录人工结果，不检测或调用平台。</p>
      </div>
      {message && <p className="mt-4 border-l-2 border-zinc-900 pl-3 text-sm text-zinc-700">{message}</p>}
    </>
  );
}
