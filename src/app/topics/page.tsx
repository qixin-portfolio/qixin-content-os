import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { loadTopicCandidatesManifestResult } from "@/lib/sources/obsidian/config";

export const dynamic = "force-dynamic";

const platformLabels: Record<string, string> = { x: "X", xiaohongshu: "小红书", douyin: "抖音", wechat_moments: "朋友圈", long_article: "长文" };

export default async function TopicsPage() {
  const manifestResult = loadTopicCandidatesManifestResult();
  const manifest = manifestResult.status === "loaded" ? manifestResult.manifest : null;
  const databaseTopics = await readDatabaseTopics();
  const topics = databaseTopics.length ? databaseTopics : (manifest?.candidates ?? []).map((candidate, index) => ({ ...candidate, id: `manifest-${index}`, sourceCount: candidate.relatedSourceRelativePaths.length, fromManifest: true }));

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-12">
      <div className="border-b border-zinc-200 pb-6">
        <p className="text-sm font-medium text-zinc-500">Content OS / Topic Staging</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">选题候选池</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">只用于人工评审和下一步研究，不自动生成文章、EventCard、MasterContent 或发布稿。</p>
      </div>
      <div className="mt-6 border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">该选题来自外部研究资料，不等于已验证事实；人工筛选后才可进入正式选题池。</div>

      <section className="mt-8 overflow-x-auto border border-zinc-200">
        <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500"><tr>{["选题", "目标受众 / 用户痛点", "核心角度", "来源", "证据", "新鲜度", "推荐平台", "风险", "状态"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-zinc-200">
            {topics.map((topic) => (
              <tr key={topic.id} className="align-top">
                <td className="px-4 py-4"><Link className="font-medium text-zinc-950 hover:underline" href={`/topics/${topic.id}`}>{topic.title}</Link></td>
                <td className="max-w-xs px-4 py-4 text-zinc-600"><p>{topic.targetAudience}</p><p className="mt-1 text-xs text-zinc-500">{topic.userPainPoint}</p></td>
                <td className="max-w-xs px-4 py-4 text-zinc-600">{topic.coreAngle}</td>
                <td className="px-4 py-4 text-zinc-600">{topic.sourceCount ?? topic.relatedSourceRelativePaths.length}</td>
                <td className="px-4 py-4"><span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">{topic.evidenceStrength}</span></td>
                <td className="px-4 py-4 text-zinc-600">{topic.freshness}</td>
                <td className="px-4 py-4 text-zinc-600">{topic.suggestedPlatforms.map((platform) => platformLabels[platform] ?? platform).join("、") || "—"}</td>
                <td className="max-w-xs px-4 py-4 text-xs leading-5 text-amber-800">{topic.riskFlags.join("、") || "—"}</td>
                <td className="px-4 py-4"><span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">{topic.status}</span>{"fromManifest" in topic && topic.fromManifest ? <p className="mt-2 text-[11px] text-zinc-500">待暂存审核</p> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!topics.length && <div className="px-6 py-12 text-center text-sm text-zinc-500">{manifestResult.status === "invalid" ? "私有选题 manifest 无法读取或格式不符合 Phase 6A 约束；请人工检查配置文件。" : "暂无候选。先生成私有 staging manifest 或导入临时数据库。"}</div>}
      </section>
      <p className="mt-4 text-xs text-zinc-500">共 {topics.length} 条；外部作者表达不会进入 VoiceSample，外部观点不会冒充齐鑫本人经历。</p>
    </main>
  );
}

async function readDatabaseTopics() {
  try {
    const topics = await getPrisma().topicCandidate.findMany({ include: { sources: { include: { sourceItem: true } } }, orderBy: { createdAt: "asc" } });
    return topics.map((topic) => ({
      id: topic.id,
      title: topic.title,
      targetAudience: topic.targetAudience,
      userPainPoint: topic.userPainPoint,
      coreAngle: topic.coreAngle,
      relatedSourceRelativePaths: topic.sources.map((source) => source.sourceItem.relativePath ?? source.sourceItem.sourcePath ?? ""),
      sourceCount: topic.sources.length,
      evidenceStrength: topic.evidenceStrength,
      freshness: topic.freshness,
      suggestedPlatforms: parseJsonArray(topic.suggestedPlatformsJson),
      riskFlags: parseJsonArray(topic.riskFlagsJson),
      status: topic.status,
      fromManifest: false,
    }));
  } catch {
    return [];
  }
}

function parseJsonArray(value: string): string[] {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; }
}
