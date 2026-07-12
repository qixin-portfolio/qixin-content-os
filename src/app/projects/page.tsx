import Link from "next/link";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await getPrisma().project.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      status: true,
    },
  });

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-6">
        <div>
          <p className="text-sm font-medium text-zinc-500">Content OS / Projects</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">项目</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            项目是素材、事件卡和后续内容资产的归属边界。
          </p>
        </div>
        <Link href="/inbox/import" className="text-sm font-medium text-zinc-700 hover:text-zinc-950">
          导入 Markdown 素材
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="mt-8 border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-600">
          暂无项目。先运行 `npm run prisma:seed` 初始化项目。
        </div>
      ) : (
        <section className="mt-8 divide-y divide-zinc-200 border-y border-zinc-200">
          {projects.map((project) => (
            <article key={project.id} className="flex flex-wrap items-start justify-between gap-4 py-6">
              <div>
                <h2 className="font-medium text-zinc-950">{project.name}</h2>
                <p className="mt-1 font-mono text-xs text-zinc-500">{project.slug}</p>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">{project.description}</p>
              </div>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                {project.status}
              </span>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
