import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { EditorialCreateActions } from "./editorial-create-actions";

export const dynamic = "force-dynamic";

const platformLabels: Record<string, string> = { wechat_moments: "朋友圈", x: "X", xiaohongshu: "小红书", douyin: "抖音" };
const statusLabels: Record<string, string> = { draft: "草稿", needs_review: "待审核", editing: "编辑中", approved: "已批准", rejected: "已拒绝" };

export default async function EditorialPage() {
  const prisma = getPrisma();
  const [drafts, masters, voices] = await Promise.all([
    prisma.editorialDraft.findMany({ orderBy: { updatedAt: "desc" }, include: { masterContent: { include: { eventCard: { include: { project: true } } } }, styleReviews: { orderBy: { createdAt: "desc" }, take: 1 } } }),
    prisma.masterContent.findMany({ orderBy: { createdAt: "desc" }, include: { eventCard: true } }),
    prisma.voiceProfile.findMany({ where: { isDefault: true }, orderBy: { platform: "asc" }, select: { id: true, name: true, platform: true } }),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <p className="text-sm text-zinc-500">Content OS / Editorial</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">人工编辑工作台</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-600">事实来源只读，建议可选，所有人工修改都进入版本历史。</p>
      <section className="mt-8 divide-y divide-zinc-200 border-y border-zinc-200">
        {drafts.length === 0 ? <p className="py-10 text-sm text-zinc-600">暂无 EditorialDraft。先从下方母内容准备平台草稿。</p> : drafts.map((draft) => { const review = draft.styleReviews[0]; return <article key={draft.id} className="flex flex-wrap items-start justify-between gap-4 py-6"><div><p className="text-xs text-zinc-500">{draft.masterContent.eventCard.project.name} · {draft.masterContent.eventCard.title}</p><h2 className="mt-1 font-medium text-zinc-950">{draft.title}</h2><p className="mt-2 text-sm text-zinc-600">{platformLabels[draft.platform]} · {statusLabels[draft.status]}</p></div><div className="flex items-center gap-4 text-sm text-zinc-600">{review && <span>StyleReview {review.overallScore}/100</span>}<Link href={`/editorial/${draft.id}`} className="font-medium text-zinc-950 underline">打开编辑</Link></div></article>; })}
      </section>
      <EditorialCreateActions masters={masters.map((master) => ({ id: master.id, title: master.title, eventTitle: master.eventCard.title }))} voices={voices} />
      <p className="mt-6 text-sm text-zinc-500"><Link href="/voice/samples" className="underline">管理个人声音样本</Link></p>
    </main>
  );
}
