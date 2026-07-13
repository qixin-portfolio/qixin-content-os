import type { PrismaClient } from "@prisma/client";
import type { ObsidianScanResult, TopicCandidateInput } from "./types.ts";

export async function importObsidianCandidates(
  prisma: PrismaClient,
  projectId: string,
  projectSourceId: string,
  scan: ObsidianScanResult,
) {
  const source = await prisma.projectSource.findFirstOrThrow({ where: { id: projectSourceId, projectId } });
  if (source.sourceType !== "obsidian_vault") throw new Error("Only obsidian_vault ProjectSource can receive Obsidian candidates");

  return prisma.$transaction(async (transaction) => {
    const observedAt = new Date(scan.lastScannedAt);
    await transaction.scanRun.create({
      data: {
        projectSourceId,
        vaultKey: scan.vaultKey,
        scanMode: "dry_run",
        discoveredCount: scan.discoveredCount,
        validCount: scan.validCount,
        skippedCount: scan.skippedCount,
        duplicateCount: scan.duplicateCount,
        riskCount: scan.riskCount,
        startedAt: observedAt,
        completedAt: observedAt,
        manifestHash: scan.manifestHash,
        status: "dry_run",
      },
    });

    let created = 0;
    let updated = 0;
    let newVersions = 0;
    const activePaths = new Set<string>();
    for (const note of scan.notes.filter((item) => item.isSourceItemCandidate)) {
      activePaths.add(note.relativePath);
      const existing = await transaction.sourceItem.findFirst({ where: { projectSourceId, relativePath: note.relativePath } });
      const data = {
        projectId,
        projectSourceId,
        sourceType: "obsidian_vault" as const,
        title: note.title,
        content: note.summary,
        sourceUrl: note.sourceUrl,
        sourcePath: note.relativePath,
        relativePath: note.relativePath,
        author: note.author,
        publishedAt: asDate(note.publishedAt),
        modifiedAt: asDate(note.modifiedAt),
        tagsJson: JSON.stringify(note.tags),
        contentHash: note.contentHash,
        summary: note.summary,
        riskFlagsJson: JSON.stringify(note.riskFlags),
        sourceCategory: note.sourceCategory,
        factEligibility: note.factEligibility,
        linksJson: JSON.stringify(note.links),
        attachmentRefsJson: JSON.stringify(note.links.attachmentRefs),
        sourceMissingAt: null,
        visibility: "private",
      };
      const item = existing
        ? await transaction.sourceItem.update({ where: { id: existing.id }, data })
        : await transaction.sourceItem.create({ data });
      if (existing) updated += 1;
      else created += 1;

      const oldVersion = await transaction.sourceItemVersion.findFirst({ where: { sourceItemId: item.id, contentHash: note.contentHash } });
      if (!oldVersion) {
        await transaction.sourceItemVersion.create({
          data: {
            sourceItemId: item.id,
            content: note.summary,
            summary: note.summary,
            contentHash: note.contentHash,
            sourceUrl: note.sourceUrl,
            modifiedAt: asDate(note.modifiedAt),
            observedAt,
          },
        });
        newVersions += 1;
      }
    }

    const previous = await transaction.sourceItem.findMany({ where: { projectSourceId, relativePath: { not: null } }, select: { id: true, relativePath: true } });
    for (const item of previous) {
      if (item.relativePath && !activePaths.has(item.relativePath)) {
        await transaction.sourceItem.update({ where: { id: item.id }, data: { sourceMissingAt: observedAt } });
      }
    }
    await transaction.projectSource.update({
      where: { id: projectSourceId },
      data: {
        displayName: scan.displayName,
        vaultKey: scan.vaultKey,
        sourceCategory: "external_research",
        rootFingerprint: scan.rootFingerprint,
        lastScannedAt: observedAt,
        enabled: true,
      },
    });
    return { created, updated, newVersions, skipped: scan.quarantinedCount };
  });
}

export async function importTopicCandidates(prisma: PrismaClient, projectId: string, candidates: TopicCandidateInput[]) {
  let created = 0;
  let updated = 0;
  let linked = 0;
  for (const candidate of candidates) {
    const existing = await prisma.topicCandidate.findFirst({ where: { projectId, title: candidate.title } });
    const topic = existing
      ? await prisma.topicCandidate.update({
          where: { id: existing.id },
          data: {
            targetAudience: candidate.targetAudience,
            userPainPoint: candidate.userPainPoint,
            coreAngle: candidate.coreAngle,
            evidenceStrength: candidate.evidenceStrength,
            freshness: candidate.freshness,
            suggestedPlatformsJson: JSON.stringify(candidate.suggestedPlatforms),
            riskFlagsJson: JSON.stringify(candidate.riskFlags),
          },
        })
      : await prisma.topicCandidate.create({
          data: {
            projectId,
            title: candidate.title,
            targetAudience: candidate.targetAudience,
            userPainPoint: candidate.userPainPoint,
            coreAngle: candidate.coreAngle,
            evidenceStrength: candidate.evidenceStrength,
            freshness: candidate.freshness,
            suggestedPlatformsJson: JSON.stringify(candidate.suggestedPlatforms),
            riskFlagsJson: JSON.stringify(candidate.riskFlags),
            status: candidate.status,
          },
        });
    if (existing) updated += 1;
    else created += 1;

    for (const [index, relativePath] of candidate.relatedSourceRelativePaths.entries()) {
      const sourceItem = await prisma.sourceItem.findFirst({ where: { projectId, relativePath } });
      if (!sourceItem) continue;
      const relation = await prisma.topicCandidateSource.findFirst({ where: { topicCandidateId: topic.id, sourceItemId: sourceItem.id } });
      if (!relation) {
        await prisma.topicCandidateSource.create({
          data: {
            topicCandidateId: topic.id,
            sourceItemId: sourceItem.id,
            relevance: "manifest reference",
            sourceRole: index === 0 ? "primary_reference" : "supporting_reference",
          },
        });
        linked += 1;
      }
    }
  }
  return { created, updated, linked };
}

export async function updateTopicCandidateStatus(
  prisma: PrismaClient,
  topicId: string,
  status: "shortlisted" | "rejected" | "proposed",
) {
  const topic = await prisma.topicCandidate.findUniqueOrThrow({ where: { id: topicId } });
  const allowed = topic.status === "proposed" && ["shortlisted", "rejected"].includes(status)
    || topic.status === "rejected" && status === "proposed";
  if (!allowed) throw new Error(`Unsupported TopicCandidate transition: ${topic.status} -> ${status}`);
  return prisma.topicCandidate.update({ where: { id: topicId }, data: { status } });
}

function asDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
