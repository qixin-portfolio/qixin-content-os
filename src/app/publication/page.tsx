import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { parsePublishChecklist } from "@/lib/publication/checklist-service";
import { PublicationCreateActions } from "./publication-create-actions";

export const dynamic = "force-dynamic";

const platformLabels: Record<string, string> = {
  wechat_moments: "朋友圈",
  x: "X",
  xiaohongshu: "小红书",
  douyin: "抖音",
};
const statusLabels: Record<string, string> = {
  ready: "待导出",
  exported: "已导出",
  published: "已人工标记发布",
  archived: "已归档",
};

export default async function PublicationPage() {
  const prisma = getPrisma();
  const [packages, approvedDrafts] = await Promise.all([
    prisma.publicationPackage.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { exports: true } },
        editorialDraft: {
          include: {
            masterContent: { include: { eventCard: { include: { project: true } } } },
          },
        },
      },
    }),
    prisma.editorialDraft.findMany({
      where: { status: "approved" },
      orderBy: { approvedAt: "desc" },
      include: { currentRevision: true, masterContent: { include: { eventCard: { include: { project: true } } } } },
    }),
  ]);
  const packageKeys = new Set(packages.map((item) => `${item.sourceRevisionId}:${item.platform}`));
  const candidates = approvedDrafts.filter((draft) => (
    draft.currentRevision?.approvedSourceRevisionId
    && !packageKeys.has(`${draft.currentRevision.approvedSourceRevisionId}:${draft.platform}`)
  ));

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-zinc-300 pb-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">Content OS / Publication ledger</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">人工发布内容包</h1>
          <p className="mt-2 text-sm text-zinc-600">从批准链生成不可改写的文案、证据快照和人工检查单。</p>
        </div>
        <Link href="/editorial" className="text-sm font-medium text-zinc-900 underline underline-offset-4">返回 Editorial Workbench</Link>
      </div>

      <PublicationCreateActions candidates={candidates.map((draft) => ({
        id: draft.id,
        title: draft.title,
        projectName: draft.masterContent.eventCard.project.name,
        platform: draft.platform,
      }))} />

      <section className="mt-8 border-t border-zinc-300">
        <div className="hidden grid-cols-[minmax(0,2fr)_0.7fr_0.8fr_1fr_0.6fr_0.8fr] gap-4 border-b border-zinc-300 bg-zinc-100 px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-zinc-600 md:grid">
          <span>内容包</span><span>平台</span><span>状态</span><span>创建时间</span><span>导出</span><span>检查单</span>
        </div>
        {packages.length === 0 ? (
          <p className="border-b border-zinc-200 px-4 py-12 text-sm text-zinc-600">暂无发布包。</p>
        ) : packages.map((item) => {
          const checklist = parsePublishChecklist(item.publishChecklistJson);
          const completed = checklist.items.filter(({ completed: done }) => done).length;
          return (
            <Link
              key={item.id}
              href={`/publication/${item.id}`}
              className="grid gap-2 border-b border-zinc-200 px-4 py-5 transition-colors hover:bg-zinc-50 md:grid-cols-[minmax(0,2fr)_0.7fr_0.8fr_1fr_0.6fr_0.8fr] md:gap-4"
            >
              <div><p className="font-medium text-zinc-950">{item.title ?? "无内部标题"}</p><p className="mt-1 text-xs text-zinc-500">{item.editorialDraft.masterContent.eventCard.project.name} · {item.id}</p></div>
              <p className="text-sm text-zinc-700">{platformLabels[item.platform]}</p>
              <p className="text-sm text-zinc-700">{statusLabels[item.status]}</p>
              <p className="font-mono text-xs text-zinc-600">{item.createdAt.toLocaleString("zh-CN", { hour12: false })}</p>
              <p className="font-mono text-sm text-zinc-700">{item._count.exports}</p>
              <p className="font-mono text-sm text-zinc-700">{completed}/{checklist.items.length}</p>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
