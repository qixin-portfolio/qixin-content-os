import Link from "next/link";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const events = await getPrisma().eventCard.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      projectId: true,
      title: true,
      status: true,
      createdAt: true,
    },
  });

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-6">
        <div>
          <p className="text-sm font-medium text-zinc-500">Content OS / Events</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">真实事件卡</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600">
            先记录事实，再进入母内容和平台草稿。每条事件都保留人工审核节点。
          </p>
        </div>
        <Link
          href="/events/new"
          className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-700"
        >
          新建事件卡
        </Link>
      </div>

      <section className="mt-8" aria-labelledby="events-heading">
        <div className="flex items-center justify-between">
          <h2 id="events-heading" className="text-sm font-semibold text-zinc-950">
            事件列表
          </h2>
          <span className="text-sm text-zinc-500">{events.length} 条</span>
        </div>

        {events.length === 0 ? (
          <div className="mt-4 border border-dashed border-zinc-300 px-6 py-12 text-center">
            <p className="text-sm text-zinc-700">还没有事件卡。</p>
            <p className="mt-2 text-sm text-zinc-500">从一条有证据的真实项目进展开始。</p>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-zinc-200 border-y border-zinc-200">
            {events.map((event) => (
              <article key={event.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
                <div>
                  <h3 className="font-medium text-zinc-950">{event.title}</h3>
                  <p className="mt-1 text-xs text-zinc-500">项目：{event.projectId}</p>
                </div>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                  {event.status}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
