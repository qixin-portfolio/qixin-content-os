import Link from "next/link";
import { contentScoreFromPersistence, scoreEventCard } from "@/lib/content/content-scorer";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const recommendationLabels = {
  publish_now: "建议单独发布",
  combine_later: "建议组合发布",
  archive_only: "暂不单独发布",
};

export default async function OpportunitiesPage() {
  const events = await getPrisma().eventCard.findMany({
    orderBy: { createdAt: "desc" },
    include: { project: true, sourceItems: true, contentScore: true, contentAngles: true },
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <div className="border-b border-zinc-200 pb-6">
        <p className="text-sm font-medium text-zinc-500">Content OS / Opportunities</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">内容机会</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">评分只决定是否建议单独发布，不删除低分事件。</p>
      </div>

      <section className="mt-8 space-y-6">
        {events.length === 0 ? (
          <div className="border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-600">暂无 EventCard。</div>
        ) : events.map((event) => {
          const score = event.contentScore
            ? contentScoreFromPersistence(event.contentScore)
            : scoreEventCard(event, event.sourceItems);
          return (
            <article key={event.id} className="border border-zinc-200 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-zinc-500">{event.project.name}</p>
                  <h2 className="mt-1 text-xl font-semibold text-zinc-950">{event.title}</h2>
                </div>
                <Link href={`/opportunities/${event.id}`} className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700">查看机会</Link>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                {[
                  ["新鲜度", score.novelty.score],
                  ["个人性", score.personal.score],
                  ["行业性", score.industry.score],
                  ["画面性", score.visual.score],
                  ["业务性", score.business.score],
                ].map(([label, value]) => <div key={label} className="bg-zinc-50 px-3 py-3"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-lg font-semibold text-zinc-950">{value}/20</p></div>)}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
                <span className="font-semibold text-zinc-950">总分 {score.totalScore}/100</span>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700">{recommendationLabels[score.recommendation]}</span>
                <span className="text-zinc-500">{event.contentAngles.length} 个角度</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-600">{score.reason}</p>
            </article>
          );
        })}
      </section>
    </main>
  );
}
