import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { loadTopicCandidatesManifest } from "@/lib/sources/obsidian/config";
import { normalizeVaultRelativePath } from "@/lib/sources/obsidian/manifest";
import { isQuarantined, redactRelativePath } from "@/lib/sources/obsidian/risk-detector";
import { toSafeResearchSummary } from "@/lib/sources/obsidian/safe-summary";
import { OBSIDIAN_FACT_ELIGIBILITY, OBSIDIAN_SOURCE_CATEGORY, type RiskFlag } from "@/lib/sources/obsidian/types";

export const dynamic = "force-dynamic";

export default async function TopicDetailPage({ params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params;
  const topic = await readTopic(topicId);
  if (!topic) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <Link href="/topics" className="text-sm text-zinc-500 hover:text-zinc-950">← 返回选题候选池</Link>
      <div className="mt-6 border-b border-zinc-200 pb-6">
        <p className="text-sm font-medium text-zinc-500">TopicCandidate / {topic.status}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">{topic.title}</h1>
        <p className="mt-4 border-l-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">该选题来自外部研究资料，不等于已验证的装修行业事实。</p>
      </div>

      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <Info label="目标受众" value={topic.targetAudience} />
        <Info label="用户痛点" value={topic.userPainPoint} />
        <Info label="核心观点" value={topic.coreAngle} />
        <Info label="证据强度 / 新鲜度" value={`${topic.evidenceStrength} / ${topic.freshness}`} />
      </section>

      <section className="mt-8 border border-zinc-200 p-6">
        <h2 className="font-semibold text-zinc-950">关联 SourceItem 候选</h2>
        {topic.sources.length ? <div className="mt-4 space-y-4">{topic.sources.map((source) => <article key={source.path} className="border-l-2 border-zinc-200 pl-4"><p className="break-all text-sm font-medium text-zinc-900">{source.path}</p><p className="mt-2 text-sm leading-6 text-zinc-600">{source.summary || "暂无安全摘要"}</p>{source.riskFlags.length ? <p className="mt-2 text-xs text-amber-800">风险：{source.riskFlags.join("、")}</p> : null}</article>)}</div> : <p className="mt-4 text-sm text-zinc-500">暂无已暂存来源；manifest 中的关联路径待人工核对。</p>}
      </section>

      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <Info label="来源风险" value={topic.riskFlags.join("、") || "暂无标记"} warning={topic.riskFlags.length > 0} />
        <Info label="推荐平台" value={topic.suggestedPlatforms.join("、") || "暂无"} />
        <Info label="缺少的一手证据" value={topic.firstHandEvidenceNeeded || "尚未填写"} />
        <Info label="推荐下一步调研动作" value="补充山西/交城本地一手资料，再决定是否进入内容生产。" />
      </section>

      {topic.persisted ? (
        <>
          <section className="mt-8 border border-zinc-200 p-6">
            <h2 className="font-semibold text-zinc-950">人工审核</h2>
            <form className="mt-4 grid gap-4" action={`/api/topics/${topic.id}/review`} method="post">
              <label className="text-sm text-zinc-700">是否值得继续研究？<select name="researchWorthiness" defaultValue={topic.researchWorthiness === null ? "" : topic.researchWorthiness ? "yes" : "no"} className="mt-2 block w-full border border-zinc-300 px-3 py-2"><option value="">未判断</option><option value="yes">是</option><option value="no">否</option></select></label>
              <label className="text-sm text-zinc-700">需要补充什么一手证据？<textarea name="firstHandEvidenceNeeded" defaultValue={topic.firstHandEvidenceNeeded ?? ""} className="mt-2 block min-h-24 w-full border border-zinc-300 px-3 py-2" /></label>
              <label className="text-sm text-zinc-700">是否适合齐鑫当前项目？<select name="fitsCurrentProject" defaultValue={topic.fitsCurrentProject === null ? "" : topic.fitsCurrentProject ? "yes" : "no"} className="mt-2 block w-full border border-zinc-300 px-3 py-2"><option value="">未判断</option><option value="yes">是</option><option value="no">否</option></select></label>
              <label className="text-sm text-zinc-700">人工备注<textarea name="humanNotes" defaultValue={topic.humanNotes ?? ""} className="mt-2 block min-h-24 w-full border border-zinc-300 px-3 py-2" /></label>
              <button className="w-fit rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700" type="submit">保存人工审核字段</button>
            </form>
          </section>
          <section className="mt-8 flex flex-wrap gap-3 border border-zinc-200 p-6">
            <span className="mr-2 self-center text-sm font-medium text-zinc-700">状态操作</span>
            {topic.status === "proposed" ? <><StatusForm id={topic.id} status="shortlisted" label="加入候选" /><StatusForm id={topic.id} status="rejected" label="暂不采用" /></> : null}
            {topic.status === "rejected" ? <StatusForm id={topic.id} status="proposed" label="退回 proposed" /> : null}
          </section>
        </>
      ) : <p className="mt-8 text-sm text-zinc-500">当前显示的是仓库外私有 manifest 预览。完成临时数据库暂存后，才可在页面保存人工审核状态。</p>}
    </main>
  );
}

function Info({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className="border border-zinc-200 p-5"><p className="text-xs text-zinc-500">{label}</p><p className={`mt-2 text-sm leading-6 ${warning ? "text-amber-800" : "text-zinc-800"}`}>{value}</p></div>;
}

function StatusForm({ id, status, label }: { id: string; status: string; label: string }) {
  return <form action={`/api/topics/${id}/status`} method="post"><input type="hidden" name="status" value={status} /><button className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50" type="submit">{label}</button></form>;
}

async function readTopic(topicId: string) {
  try {
    const topic = await getPrisma().topicCandidate.findUnique({ where: { id: topicId }, include: { sources: { include: { sourceItem: true } } } });
    if (topic) return {
      id: topic.id,
      title: topic.title,
      targetAudience: topic.targetAudience,
      userPainPoint: topic.userPainPoint,
      coreAngle: topic.coreAngle,
      evidenceStrength: topic.evidenceStrength,
      freshness: topic.freshness,
      suggestedPlatforms: parseArray(topic.suggestedPlatformsJson),
      riskFlags: parseArray(topic.riskFlagsJson),
      status: topic.status,
      sources: topic.sources.flatMap((source) => {
        const item = source.sourceItem;
        const riskFlags = parseArray(item.riskFlagsJson ?? "[]");
        const relativePath = item.relativePath ? normalizeVaultRelativePath(item.relativePath) : null;
        if (item.sourceType !== "obsidian_vault" || item.sourceCategory !== OBSIDIAN_SOURCE_CATEGORY || item.factEligibility !== OBSIDIAN_FACT_ELIGIBILITY || item.sourceMissingAt || isQuarantined(riskFlags as RiskFlag[]) || !relativePath || relativePath !== item.relativePath) return [];
        const safeSummary = toSafeResearchSummary(item.summary ?? "");
        return [{ path: redactRelativePath(relativePath), summary: safeSummary, riskFlags }];
      }),
      firstHandEvidenceNeeded: topic.firstHandEvidenceNeeded,
      researchWorthiness: topic.researchWorthiness,
      fitsCurrentProject: topic.fitsCurrentProject,
      humanNotes: topic.humanNotes,
      persisted: true,
    };
  } catch {
    // The review-only manifest can still be viewed before a staging database is initialized.
  }
  const index = topicId.startsWith("manifest-") ? Number(topicId.slice("manifest-".length)) : -1;
  const candidate = loadTopicCandidatesManifest()?.candidates[index];
  return candidate ? { ...candidate, id: topicId, status: candidate.status, sources: [], firstHandEvidenceNeeded: "", researchWorthiness: null, fitsCurrentProject: null, humanNotes: "", persisted: false } : null;
}

function parseArray(value: string): string[] {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; }
}
