"use client";

import { useState } from "react";

type Draft = { id: string; title: string; body: string; hook: string; cta: string; status: string; platform: string };
type Review = { overallScore: number; aiToneScore: number; authenticityScore: number; clarityScore: number; salesToneScore: number; issues: Array<{ code: string; severity: string; field: string; excerpt: string; explanation: string }>; suggestions: Array<{ field: string; originalText: string; suggestedText: string; reason: string }> };
type SuggestionResult = { titleSuggestions: string[]; hookSuggestions: string[]; bodySuggestions: Array<{ original: string; suggested: string; reason: string }>; ctaSuggestions: string[]; allowEmptyHook: boolean; allowEmptyCta: boolean };

export function EditorialEditor({ draft, review, revisions }: { draft: Draft; review: Review | null; revisions: Array<{ revisionNumber: number; changeSource: string; changeSummary: string; createdAt: string }> }) {
  const [content, setContent] = useState({ title: draft.title, body: draft.body, hook: draft.hook, cta: draft.cta });
  const [currentReview, setCurrentReview] = useState(review);
  const [suggestions, setSuggestions] = useState<SuggestionResult | null>(null);
  const [changeSummary, setChangeSummary] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [message, setMessage] = useState("");

  async function save() {
    const response = await fetch(`/api/editorial/${draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...content, changeSummary }) });
    const result = await response.json() as { errors?: string[]; styleReview?: Review };
    setMessage(response.ok ? "人工 revision 已保存。" : result.errors?.join("；") ?? "保存失败");
    if (result.styleReview) setCurrentReview(result.styleReview);
  }

  async function loadSuggestions() {
    const response = await fetch(`/api/editorial/${draft.id}/suggestions`);
    const result = await response.json() as { errors?: string[]; suggestions?: SuggestionResult; styleReview?: Review };
    if (!response.ok) setMessage(result.errors?.join("；") ?? "建议获取失败");
    else { setSuggestions(result.suggestions ?? null); setCurrentReview(result.styleReview ?? currentReview); }
  }

  async function adoptSuggestion() {
    const next = {
      ...content,
      title: suggestions?.titleSuggestions[0] || content.title,
      hook: suggestions?.hookSuggestions.find((value) => value && !value.includes("可以保持为空")) || content.hook,
      body: suggestions?.bodySuggestions[0]?.suggested || content.body,
      cta: suggestions?.ctaSuggestions.find((value) => value && !value.includes("可以留空")) || content.cta,
    };
    const response = await fetch(`/api/editorial/${draft.id}/suggestions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...next, changeSummary: "人工选择并采用修改建议" }) });
    const result = await response.json() as { errors?: string[]; styleReview?: Review };
    setMessage(response.ok ? "建议已作为新 revision 保存，未覆盖历史版本。" : result.errors?.join("；") ?? "采用建议失败");
    if (response.ok) { setContent(next); if (result.styleReview) setCurrentReview(result.styleReview); }
  }

  async function approve() {
    const response = await fetch(`/api/editorial/${draft.id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ overrideReason: overrideReason || undefined, qualityRating: 5, notes: "人工批准前由编辑工作台确认。" }) });
    const result = await response.json() as { errors?: string[] };
    setMessage(response.ok ? "已批准，并沉淀为 VoiceSample。" : result.errors?.join("；") ?? "批准失败");
  }

  async function reject() {
    const reason = window.prompt("请输入拒绝原因") ?? "";
    if (!reason.trim()) return;
    const response = await fetch(`/api/editorial/${draft.id}/reject`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    setMessage(response.ok ? "已拒绝，原因已写入版本历史。" : "拒绝失败");
  }

  const field = (key: keyof typeof content, label: string, rows: number) => <label className="block text-sm text-zinc-700"><span>{label}</span><textarea value={content[key]} onChange={(event) => setContent({ ...content, [key]: event.target.value })} rows={rows} className="mt-1 block w-full border border-zinc-300 px-3 py-2" /></label>;

  return <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.3fr_1fr]">
    <section className="border border-zinc-200 p-5"><h2 className="text-sm font-semibold text-zinc-950">编辑稿</h2><div className="mt-4 space-y-4">{field("title", "标题", 2)}{field("hook", "Hook（可以为空）", 3)}{field("body", "正文", 12)}{field("cta", "CTA（可以为空）", 3)}<label className="block text-sm text-zinc-700">修改摘要<input value={changeSummary} onChange={(event) => setChangeSummary(event.target.value)} className="mt-1 block h-10 w-full border border-zinc-300 px-3" /></label><button type="button" onClick={save} disabled={!changeSummary.trim()} className="bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">保存人工 revision</button></div></section>
    <section className="border border-zinc-200 p-5"><h2 className="text-sm font-semibold text-zinc-950">StyleReview</h2>{currentReview ? <><div className="mt-4 grid grid-cols-2 gap-3 text-sm">{[["总分", currentReview.overallScore], ["AI 腔", currentReview.aiToneScore], ["像本人", currentReview.authenticityScore], ["清晰度", currentReview.clarityScore], ["营销腔（越高越重）", currentReview.salesToneScore]].map(([label, value]) => <div key={label} className="bg-zinc-50 p-3"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-lg font-semibold text-zinc-950">{value}</p></div>)}</div><div className="mt-5 space-y-3">{currentReview.issues.map((issue, index) => <div key={`${issue.code}-${index}`} className="border-l-2 border-amber-400 pl-3 text-sm"><p className="font-medium text-zinc-900">{issue.code} · {issue.field}</p><p className="mt-1 text-zinc-600">{issue.explanation}</p><p className="mt-1 text-xs text-zinc-500">{issue.excerpt}</p></div>)}</div></> : <p className="mt-4 text-sm text-zinc-600">暂无 StyleReview。</p>}<div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={loadSuggestions} className="border border-zinc-300 px-3 py-2 text-sm">查看修改建议</button>{suggestions && <button type="button" onClick={adoptSuggestion} className="bg-zinc-950 px-3 py-2 text-sm text-white">采用建议并新建 revision</button>}</div>{suggestions && <div className="mt-4 space-y-3 text-sm"><p className="font-medium">建议</p>{suggestions.bodySuggestions.map((item, index) => <div key={index} className="border-t border-zinc-100 pt-2"><p className="text-zinc-500">{item.reason}</p><p className="mt-1 text-zinc-800">{item.suggested || "（可留空）"}</p></div>)}</div>}</section>
    <section className="space-y-6"><div className="border border-zinc-200 p-5"><h2 className="text-sm font-semibold text-zinc-950">审批</h2><p className="mt-3 text-sm text-zinc-600">低于 70 分不能批准；如人工明确覆盖，必须填写原因。批准后才会沉淀为 VoiceSample。</p><label className="mt-4 block text-sm text-zinc-700">override 原因<textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} rows={3} className="mt-1 block w-full border border-zinc-300 px-3 py-2" /></label><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={approve} className="bg-zinc-950 px-3 py-2 text-sm text-white">批准当前稿</button><button type="button" onClick={reject} className="border border-zinc-300 px-3 py-2 text-sm">拒绝</button></div>{message && <p className="mt-3 text-sm text-zinc-600">{message}</p>}</div><div className="border border-zinc-200 p-5"><h2 className="text-sm font-semibold text-zinc-950">版本历史</h2><div className="mt-4 space-y-3">{revisions.map((revision) => <div key={revision.revisionNumber} className="border-b border-zinc-100 pb-3 text-sm last:border-0"><p className="font-medium text-zinc-900">Revision {revision.revisionNumber} · {revision.changeSource}</p><p className="mt-1 text-zinc-600">{revision.changeSummary}</p></div>)}</div></div></section>
  </div>;
}
