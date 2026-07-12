import { getPrisma } from "@/lib/prisma";
import { SampleActions } from "./sample-actions";
import { SampleToggle } from "./sample-toggle";

export const dynamic = "force-dynamic";

const platformLabels: Record<string, string> = { wechat_moments: "朋友圈", x: "X", xiaohongshu: "小红书", douyin: "抖音" };

export default async function VoiceSamplesPage() {
  const prisma = getPrisma();
  const [profiles, samples] = await Promise.all([
    prisma.voiceProfile.findMany({ orderBy: { platform: "asc" }, select: { id: true, name: true, platform: true } }),
    prisma.voiceSample.findMany({ orderBy: { updatedAt: "desc" }, include: { voiceProfile: { select: { name: true } } } }),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <p className="text-sm text-zinc-500">Content OS / Voice</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">个人声音样本</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-600">当前是规则校准，不是完整个人声音学习。</p>
      {samples.length === 0 && <div className="mt-6 border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900">当前只有规则，没有足够的本人文案样本，声音校准结果有限。</div>}
      <section className="mt-8 divide-y divide-zinc-200 border-y border-zinc-200">
        {samples.map((sample) => (
          <article key={sample.id} className="py-6">
            <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-medium text-zinc-950">{sample.title}</h2><p className="mt-1 text-xs text-zinc-500">{sample.voiceProfile.name} · {platformLabels[sample.platform]} · 来源：{sample.sourceType}</p></div><div className="flex items-center gap-3 text-sm text-zinc-600">质量 {sample.qualityRating}/5 · {sample.active ? "启用" : "停用"}<SampleToggle id={sample.id} active={sample.active} /></div></div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-700">{sample.body}</p>
            {sample.notes && <p className="mt-3 text-sm text-zinc-500">说明：{sample.notes}</p>}
          </article>
        ))}
      </section>
      <SampleActions profiles={profiles} />
    </main>
  );
}
