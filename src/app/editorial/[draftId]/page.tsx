import Link from "next/link";
import { notFound } from "next/navigation";
import { EditorialEditor } from "./editorial-editor";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const platformLabels: Record<string, string> = { wechat_moments: "朋友圈", x: "X", xiaohongshu: "小红书", douyin: "抖音" };

export default async function EditorialDetailPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  const draft = await getPrisma().editorialDraft.findUnique({
    where: { id: draftId },
    include: {
      masterContent: { include: { eventCard: { include: { project: true, sourceItems: true, contentAngles: true } } } },
      voiceProfile: { select: { id: true, name: true, platform: true } },
      revisions: { orderBy: { revisionNumber: "desc" } },
      styleReviews: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!draft) notFound();
  const review = draft.styleReviews[0];
  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-12">
      <Link href="/editorial" className="text-sm text-zinc-500 underline">返回编辑工作台</Link>
      <p className="mt-6 text-sm text-zinc-500">{draft.masterContent.eventCard.project.name} · {platformLabels[draft.platform]}</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">{draft.masterContent.eventCard.title}</h1>
      <div className="mt-5 grid gap-6 lg:grid-cols-3"><section className="border border-zinc-200 p-5 lg:col-span-2"><h2 className="text-sm font-semibold">事实来源（只读）</h2><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-zinc-500">发生了什么</dt><dd className="mt-1 leading-6 text-zinc-800">{draft.masterContent.eventCard.whatHappened}</dd></div><div><dt className="text-zinc-500">遇到问题</dt><dd className="mt-1 leading-6 text-zinc-800">{draft.masterContent.eventCard.problem}</dd></div><div><dt className="text-zinc-500">结果</dt><dd className="mt-1 leading-6 text-zinc-800">{draft.masterContent.eventCard.result}</dd></div><div><dt className="text-zinc-500">个人感受</dt><dd className="mt-1 leading-6 text-zinc-800">{draft.masterContent.eventCard.personalReflection}</dd></div></dl><p className="mt-4 text-xs text-zinc-500">SourceItem：{draft.masterContent.eventCard.sourceItems.map((source) => source.id).join("、")}</p></section><section className="border border-zinc-200 p-5"><h2 className="text-sm font-semibold">VoiceProfile</h2><p className="mt-3 text-sm text-zinc-800">{draft.voiceProfile?.name ?? "未绑定"}</p><p className="mt-1 text-xs text-zinc-500">{draft.voiceProfile?.platform ?? ""}</p><h2 className="mt-6 text-sm font-semibold">来源角度</h2><div className="mt-4 space-y-3 text-sm">{draft.masterContent.eventCard.contentAngles.map((angle) => <div key={angle.id}><p className="font-medium text-zinc-900">{angle.title}</p><p className="mt-1 leading-6 text-zinc-600">{angle.coreIdea}</p></div>)}</div></section></div>
      <EditorialEditor draft={draft} review={review ? { overallScore: review.overallScore, aiToneScore: review.aiToneScore, authenticityScore: review.authenticityScore, clarityScore: review.clarityScore, salesToneScore: review.salesToneScore, issues: JSON.parse(review.issuesJson), suggestions: JSON.parse(review.suggestionsJson) } : null} revisions={draft.revisions.map((revision) => ({ revisionNumber: revision.revisionNumber, changeSource: revision.changeSource, changeSummary: revision.changeSummary, createdAt: revision.createdAt.toISOString() }))} />
    </main>
  );
}
