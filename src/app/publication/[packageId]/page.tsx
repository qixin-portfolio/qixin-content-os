import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { parsePublishChecklist } from "@/lib/publication/checklist-service";
import { PublicationActions } from "./publication-actions";

export const dynamic = "force-dynamic";

type EvidenceSnapshot = {
  sourceItems: Array<{ id: string; type: string; title: string; sourceReference: string | null; contentHash: string }>;
};
type FactBoundary = { confirmedFacts: string[]; unverifiedClaims: string[]; prohibitedClaims: string[]; missingEvidence: string[] };
type AssetBrief = {
  recommendedAssetType: string[];
  purpose: string;
  requiredElements: string[];
  optionalElements: string[];
  avoidElements: string[];
  existingAssetIds: string[];
  missingAssets: string[];
  privacyRisks: string[];
  suggestedCount: number;
  suggestedAspectRatio: string[];
};

const platformLabels: Record<string, string> = { wechat_moments: "朋友圈", x: "X", xiaohongshu: "小红书", douyin: "抖音" };
const statusLabels: Record<string, string> = { ready: "待导出", exported: "已导出", published: "已人工标记发布", archived: "已归档" };

function ItemList({ items, empty = "无" }: { items: string[]; empty?: string }) {
  return items.length > 0
    ? <ul className="mt-2 space-y-1.5 text-sm leading-5 text-zinc-800">{items.map((item) => <li key={item} className="border-l border-zinc-300 pl-3">{item}</li>)}</ul>
    : <p className="mt-2 text-sm text-zinc-500">{empty}</p>;
}

export default async function PublicationDetailPage({ params }: { params: Promise<{ packageId: string }> }) {
  const { packageId } = await params;
  const item = await getPrisma().publicationPackage.findUnique({
    where: { id: packageId },
    include: {
      exports: { orderBy: { createdAt: "desc" } },
      editorialDraft: { include: { masterContent: { include: { eventCard: { include: { project: true } } } } } },
    },
  });
  if (!item) notFound();
  const evidence = JSON.parse(item.evidenceSnapshotJson) as EvidenceSnapshot;
  const facts = JSON.parse(item.factBoundaryJson) as FactBoundary;
  const assets = JSON.parse(item.assetBriefJson) as AssetBrief;
  const checklist = parsePublishChecklist(item.publishChecklistJson);
  const finalCopy = [item.hook, item.body, item.cta].filter(Boolean).join("\n\n");
  const automaticItems = checklist.items.filter(({ kind }) => kind === "automatic");
  const manualItems = checklist.items.filter(({ kind }) => kind === "manual");

  return (
    <main className="mx-auto w-full max-w-[1500px] px-5 py-8 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-300 pb-5">
        <div><Link href="/publication" className="font-mono text-xs uppercase tracking-wider text-zinc-500 underline">← Publication ledger</Link><p className="mt-4 text-xs text-zinc-500">{item.editorialDraft.masterContent.eventCard.project.name} · {platformLabels[item.platform]}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">{item.title ?? "无内部标题"}</h1></div>
        <div className="text-right"><p className="font-mono text-xs text-zinc-500">{item.id}</p><p className="mt-2 inline-block border border-zinc-400 px-2 py-1 text-xs font-medium">{statusLabels[item.status]}</p></div>
      </div>

      <div className="mt-5 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">该文案来自已批准 Revision，修改需重新进入编辑流程。<Link href={`/editorial/${item.editorialDraftId}`} className="ml-2 font-medium underline">返回 Editorial Workbench</Link></div>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[1.05fr_1fr_0.95fr]">
        <section className="border border-zinc-300 bg-white p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">01 / Approved copy</p>
          <h2 className="mt-2 text-base font-semibold">最终发布文案</h2>
          {item.hook && <p className="mt-5 border-l-2 border-zinc-950 pl-4 font-medium leading-7 text-zinc-950">{item.hook}</p>}
          <div className="mt-5 whitespace-pre-wrap text-[15px] leading-7 text-zinc-900">{item.body}</div>
          {item.cta && <p className="mt-5 text-sm leading-6 text-zinc-700">{item.cta}</p>}
          <div className="mt-6 border-t border-zinc-200 pt-5"><PublicationActions packageId={item.id} finalCopy={finalCopy} manualItems={manualItems.map(({ id, label, completed }) => ({ id, label, completed }))} /></div>
        </section>

        <section className="space-y-5">
          <div className="border border-zinc-300 bg-white p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">02 / Evidence snapshot</p>
            <h2 className="mt-2 text-base font-semibold">证据来源</h2>
            <div className="mt-4 space-y-4">{evidence.sourceItems.map((source) => <article key={source.id} className="border-t border-zinc-200 pt-3"><p className="text-sm font-medium text-zinc-950">{source.title}</p><p className="mt-1 text-xs text-zinc-500">{source.type} · {source.id}</p><p className="mt-2 break-all font-mono text-[10px] leading-4 text-zinc-500">SHA-256 {source.contentHash}</p>{source.sourceReference && <p className="mt-1 break-all text-xs text-zinc-600">引用：{source.sourceReference}</p>}</article>)}</div>
          </div>
          <div className="border border-zinc-300 bg-white p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">03 / Fact boundary</p>
            <h3 className="mt-3 text-sm font-semibold">已确认事实</h3><ItemList items={facts.confirmedFacts} />
            <h3 className="mt-5 text-sm font-semibold">缺少证据</h3><ItemList items={facts.missingEvidence} />
            <h3 className="mt-5 text-sm font-semibold text-red-800">禁止声明</h3><ItemList items={facts.prohibitedClaims} />
            <h3 className="mt-5 text-sm font-semibold">未验证声明</h3><ItemList items={facts.unverifiedClaims} />
          </div>
        </section>

        <section className="space-y-5">
          <div className="border border-zinc-300 bg-white p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">04 / Asset brief</p>
            <h2 className="mt-2 text-base font-semibold">配图需求</h2><p className="mt-3 text-sm leading-6 text-zinc-700">{assets.purpose}</p>
            <h3 className="mt-4 text-sm font-semibold">建议类型</h3><ItemList items={assets.recommendedAssetType} />
            <h3 className="mt-4 text-sm font-semibold">必须包含</h3><ItemList items={assets.requiredElements} />
            <h3 className="mt-4 text-sm font-semibold">禁止与规避</h3><ItemList items={assets.avoidElements} />
            <h3 className="mt-4 text-sm font-semibold">现有可用 Asset</h3><ItemList items={assets.existingAssetIds} empty="暂无已确认可发布的真实 Asset" />
            <p className="mt-4 border-t border-zinc-200 pt-3 text-xs leading-5 text-zinc-500">建议 {assets.suggestedCount} 张 · {assets.suggestedAspectRatio.join(" / ")}</p>
          </div>
          <div className="border border-zinc-300 bg-white p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">05 / Automatic checks</p>
            <h2 className="mt-2 text-base font-semibold">系统检查</h2>
            <div className="mt-4 space-y-3">{automaticItems.map((check) => <div key={check.id} className="grid grid-cols-[1.2rem_1fr] gap-2 text-sm"><span className={check.completed ? "text-emerald-700" : "text-red-700"}>{check.completed ? "✓" : "×"}</span><div><p className="font-medium text-zinc-900">{check.label}</p><p className="mt-0.5 text-xs leading-5 text-zinc-500">{check.detail}</p></div></div>)}</div>
          </div>
          <div className="border border-zinc-300 bg-zinc-50 p-5"><p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">Export ledger</p><p className="mt-2 text-sm text-zinc-700">累计 {item.exports.length} 次导出</p><div className="mt-3 space-y-2">{item.exports.slice(0, 5).map((record) => <p key={record.id} className="font-mono text-[10px] leading-4 text-zinc-500">{record.format} · {record.fileName}<br />{record.contentHash.slice(0, 16)}…</p>)}</div></div>
        </section>
      </div>

      <footer className="mt-6 flex flex-wrap justify-between gap-4 border-t border-zinc-300 pt-4 font-mono text-[10px] leading-5 text-zinc-500"><span>PACKAGE HASH {item.packageHash}</span><span>SOURCE {item.sourceRevisionId} · APPROVAL {item.approvalRevisionId}</span></footer>
    </main>
  );
}
