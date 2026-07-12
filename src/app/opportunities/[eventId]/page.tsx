import Link from "next/link";
import { notFound } from "next/navigation";
import { contentScoreFromPersistence, scoreEventCard } from "@/lib/content/content-scorer";
import { getPrisma } from "@/lib/prisma";
import { OpportunityActions } from "./opportunity-actions";

export const dynamic = "force-dynamic";

export default async function OpportunityDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const prisma = getPrisma();
  const event = await prisma.eventCard.findUnique({ where: { id: eventId }, include: { project: true, sourceItems: true, contentScore: true, contentAngles: true, masterContent: true } });
  if (!event) notFound();

  const score = event.contentScore
    ? contentScoreFromPersistence(event.contentScore)
    : scoreEventCard(event, event.sourceItems);
  const voices = await prisma.voiceProfile.findMany({ where: { isDefault: true }, orderBy: { platform: "asc" }, select: { id: true, name: true, platform: true } });

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <Link href="/opportunities" className="text-sm text-zinc-500 hover:text-zinc-950">返回内容机会</Link>
      <p className="mt-6 text-sm text-zinc-500">{event.project.name}</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">{event.title}</h1>
      <section className="mt-8 border border-zinc-200 p-6"><h2 className="text-sm font-semibold text-zinc-950">评分</h2><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">{[["新鲜度", score.novelty.score], ["个人性", score.personal.score], ["行业性", score.industry.score], ["画面性", score.visual.score], ["业务性", score.business.score]].map(([label, value]) => <div key={label} className="bg-zinc-50 px-3 py-3"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-lg font-semibold">{value}/20</p></div>)}</div><p className="mt-5 text-sm font-semibold">总分 {score.totalScore}/100 · {score.recommendation}</p><p className="mt-2 text-sm leading-6 text-zinc-600">{score.reason}</p></section>
      <section className="mt-6 border border-zinc-200 p-6"><h2 className="text-sm font-semibold text-zinc-950">内容角度</h2><div className="mt-4 space-y-4">{event.contentAngles.map((angle) => <article key={angle.id} className="border-b border-zinc-100 pb-4 last:border-0"><h3 className="font-medium text-zinc-950">{angle.title}</h3><p className="mt-1 text-sm leading-6 text-zinc-700">{angle.coreIdea}</p><p className="mt-1 text-xs text-zinc-500">面向：{angle.targetAudience} · {angle.angleType}</p></article>)}</div></section>
      <section className="mt-6 border border-zinc-200 p-6"><h2 className="text-sm font-semibold text-zinc-950">证据来源</h2><div className="mt-4 space-y-2">{event.sourceItems.map((source) => <div key={source.id} className="flex flex-wrap justify-between gap-3 text-sm"><span className="text-zinc-800">{source.title}</span><span className="font-mono text-xs text-zinc-500">{source.id}</span></div>)}</div></section>
      <section className="mt-6 border border-zinc-200 p-6"><h2 className="text-sm font-semibold text-zinc-950">人工确认后生成</h2><OpportunityActions eventId={event.id} angles={event.contentAngles} voices={voices} existingMaster={Boolean(event.masterContent)} /></section>
    </main>
  );
}
