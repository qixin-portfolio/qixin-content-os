import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { getConfiguredObsidianVaultPath } from "@/lib/sources/obsidian/config";
import { redactRelativePath } from "@/lib/sources/obsidian/risk-detector";
import { scanObsidianVault } from "@/lib/sources/obsidian/scanner";
import type { ObsidianScanResult } from "@/lib/sources/obsidian/types";

export const dynamic = "force-dynamic";

export default async function ObsidianSourcePage() {
  const vaultPath = getConfiguredObsidianVaultPath();
  const liveScan = readLiveScan(vaultPath);
  const scan = liveScan.scan;
  const persisted = await readPersistedSource();
  const markdownCount = scan?.markdownCount ?? persisted?.latestScan?.validCount ?? 0;
  const sourceCompleteness = scan && scan.markdownCount > 0
    ? `${Math.round(((scan.markdownCount - scan.missingSource) / scan.markdownCount) * 100)}%`
    : persisted ? "已记录" : "未扫描";

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-6">
        <div>
          <p className="text-sm font-medium text-zinc-500">Content OS / Sources</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">外部内容运营研究库</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">只读 Markdown 研究源。它提供选题线索和外部观点参考，不是山西装修行业事实库。</p>
        </div>
        <Link href="/topics" className="text-sm font-medium text-zinc-700 hover:text-zinc-950">查看选题候选池 →</Link>
      </div>

      <div className="mt-8 flex flex-wrap gap-3 text-xs">
        <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-900">只读 dry-run</span>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700">sourceCategory: external_research</span>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700">factEligibility: unverified_reference</span>
      </div>
      <div className="mt-6 border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">外部研究资料，不等于已验证的装修行业事实。</div>

      {liveScan.error ? (
        <div className="mt-8 border border-rose-200 bg-rose-50 px-6 py-8 text-sm text-rose-900">
          扫描源当前不可读取。请检查 <code>OBSIDIAN_RESEARCH_VAULT_PATH</code> 是否指向可访问的真实目录；系统不会猜测或展示本地路径。
        </div>
      ) : !vaultPath && !persisted ? (
        <div className="mt-8 border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-600">
          尚未配置扫描源。运行时通过环境变量 <code>OBSIDIAN_RESEARCH_VAULT_PATH</code> 提供 Vault 路径，系统不会保存该路径。
        </div>
      ) : (
        <>
          <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["最近扫描", scan?.lastScannedAt ?? persisted?.source?.lastScannedAt?.toISOString() ?? "未扫描"],
              ["文件 / Markdown", `${scan?.discoveredCount ?? "—"} / ${markdownCount || "—"}`],
              ["SourceItem 候选", scan?.sourceItemCandidates ?? "—"],
              ["重复 / 风险", `${scan?.duplicateCount ?? "—"} / ${scan?.quarantinedCount ?? "—"}`],
            ].map(([label, value]) => (
              <div key={label} className="border border-zinc-200 bg-white px-4 py-4">
                <p className="text-xs text-zinc-500">{label}</p>
                <p className="mt-2 break-words text-lg font-semibold text-zinc-950">{value}</p>
              </div>
            ))}
          </section>
          <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
            <div className="border border-zinc-200 p-6">
              <h2 className="font-semibold text-zinc-950">扫描摘要</h2>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                <SummaryRow label="来源完整度" value={sourceCompleteness} />
                <SummaryRow label="缺少来源" value={scan?.missingSource ?? "—"} />
                <SummaryRow label="断链" value={scan?.brokenLinks ?? "—"} />
                <SummaryRow label="缺少附件" value={scan?.missingAttachments ?? "—"} />
              </dl>
              <p className="mt-6 text-xs leading-5 text-zinc-500">扫描只读取 Markdown 和文件元数据，不复制附件、不修改原文件、不写入真实业务表。</p>
            </div>
            <div className="border border-zinc-200 p-6">
              <h2 className="font-semibold text-zinc-950">隔离清单</h2>
              {scan?.notes.filter((note) => note.isQuarantined).length ? (
                <ul className="mt-4 space-y-3 text-sm">
                  {scan.notes.filter((note) => note.isQuarantined).slice(0, 12).map((note) => (
                    <li key={note.relativePath} className="border-l-2 border-amber-400 pl-3">
                      <p className="break-all text-zinc-800">{redactRelativePath(note.relativePath)}</p>
                      <p className="mt-1 text-xs text-amber-800">{note.riskFlags.join("、")}</p>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-4 text-sm text-zinc-500">当前没有可展示的风险笔记。</p>}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function readLiveScan(vaultPath?: string): { scan: ObsidianScanResult | null; error: boolean } {
  if (!vaultPath) return { scan: null, error: false };
  try {
    return { scan: scanObsidianVault(vaultPath), error: false };
  } catch {
    return { scan: null, error: true };
  }
}

function SummaryRow({ label, value }: { label: string; value: string | number }) {
  return <div><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 font-medium text-zinc-900">{value}</dd></div>;
}

async function readPersistedSource() {
  try {
    const source = await getPrisma().projectSource.findFirst({ where: { sourceType: "obsidian_vault" }, include: { scanRuns: { orderBy: { startedAt: "desc" }, take: 1 } } });
    return source ? { source, latestScan: source.scanRuns[0] } : null;
  } catch {
    return null;
  }
}
