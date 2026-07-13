import type { PrismaClient } from "@prisma/client";
import { normalizeVaultRelativePath } from "./manifest.ts";
import { isQuarantined, redactRelativePath, redactSensitiveText } from "./risk-detector.ts";
import { toSafeResearchSummary } from "./safe-summary.ts";
import { OBSIDIAN_FACT_ELIGIBILITY, OBSIDIAN_SOURCE_CATEGORY, type ObsidianNoteScan } from "./types.ts";
import type { ObsidianScanResult, TopicCandidateInput } from "./types.ts";

export async function importObsidianCandidates(
  prisma: PrismaClient,
  projectId: string,
  projectSourceId: string,
  scan: ObsidianScanResult,
) {
  return withStagingRetry(() => prisma.$transaction(async (transaction) => {
    const source = await transaction.projectSource.findFirstOrThrow({ where: { id: projectSourceId, projectId } });
    if (source.sourceType !== "obsidian_vault") throw new Error("Only obsidian_vault ProjectSource can receive Obsidian candidates");
    if (!source.vaultKey || source.vaultKey !== scan.vaultKey) throw new Error("Scan vaultKey does not match the target ProjectSource");
    const observedAt = new Date(scan.lastScannedAt);
    const importableNotes = scan.notes.filter(isImportableNote);
    await transaction.scanRun.create({
      data: {
        projectSourceId,
        vaultKey: scan.vaultKey,
        scanMode: "staging_import",
        discoveredCount: scan.discoveredCount,
        validCount: importableNotes.length,
        skippedCount: scan.notes.length - importableNotes.length,
        duplicateCount: scan.duplicateCount,
        riskCount: scan.riskCount,
        startedAt: observedAt,
        completedAt: observedAt,
        manifestHash: scan.manifestHash,
        status: "completed",
      },
    });

    let created = 0;
    let updated = 0;
    let newVersions = 0;
    const activePaths = new Set<string>();
    for (const note of importableNotes) {
      activePaths.add(note.relativePath);
      const uniquePath = { projectSourceId_relativePath: { projectSourceId, relativePath: note.relativePath } };
      const existing = await transaction.sourceItem.findUnique({ where: uniquePath });
      const safeSummary = boundedSummary(note.summary);
      const data = {
        projectId,
        projectSourceId,
        sourceType: "obsidian_vault" as const,
        title: note.title,
        content: safeSummary,
        sourceUrl: note.sourceUrl,
        sourcePath: note.relativePath,
        relativePath: note.relativePath,
        author: note.author,
        publishedAt: asDate(note.publishedAt),
        modifiedAt: asDate(note.modifiedAt),
        tagsJson: JSON.stringify(note.tags),
        contentHash: note.contentHash,
        summary: safeSummary,
        riskFlagsJson: JSON.stringify(note.riskFlags),
        sourceCategory: note.sourceCategory,
        factEligibility: note.factEligibility,
        linksJson: JSON.stringify(note.links),
        attachmentRefsJson: JSON.stringify(note.links.attachmentRefs),
        sourceMissingAt: null,
        visibility: "private",
      };
      const item = await transaction.sourceItem.upsert({ where: uniquePath, create: data, update: data });
      if (existing) updated += 1;
      else created += 1;

      const versionKey = { sourceItemId_contentHash: { sourceItemId: item.id, contentHash: note.contentHash } };
      const oldVersion = await transaction.sourceItemVersion.findUnique({ where: versionKey });
      await transaction.sourceItemVersion.upsert({
        where: versionKey,
        update: {},
        create: {
            sourceItemId: item.id,
            content: safeSummary,
            summary: safeSummary,
            contentHash: note.contentHash,
            sourceUrl: note.sourceUrl,
            modifiedAt: asDate(note.modifiedAt),
            observedAt,
        },
      });
      if (!oldVersion) newVersions += 1;
    }

    for (const note of scan.notes.filter((item) => !isImportableNote(item))) {
      const relativePath = normalizeVaultRelativePath(note.relativePath);
      if (!relativePath || relativePath !== note.relativePath) continue;
      const existing = await transaction.sourceItem.findUnique({ where: { projectSourceId_relativePath: { projectSourceId, relativePath } } });
      if (existing) {
        await transaction.sourceItem.update({
          where: { id: existing.id },
          data: { sourceMissingAt: observedAt, riskFlagsJson: JSON.stringify(note.riskFlags) },
        });
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
        sourceCategory: OBSIDIAN_SOURCE_CATEGORY,
        rootFingerprint: scan.rootFingerprint,
        lastScannedAt: observedAt,
        enabled: true,
      },
    });
    return { created, updated, newVersions, skipped: scan.notes.length - importableNotes.length };
  }));
}

export async function importTopicCandidates(
  prisma: PrismaClient,
  projectId: string,
  candidates: TopicCandidateInput[],
  projectSourceId?: string,
) {
  return withStagingRetry(() => prisma.$transaction(async (transaction) => {
    const availableSources = await transaction.projectSource.findMany({
      where: { projectId, sourceType: "obsidian_vault", sourceCategory: OBSIDIAN_SOURCE_CATEGORY },
      select: { id: true },
    });
    const selectedSourceId = projectSourceId ?? (availableSources.length === 1 ? availableSources[0].id : undefined);
    if (projectSourceId && !availableSources.some((source) => source.id === projectSourceId)) {
      throw new Error("TopicCandidate source must be an external-research Obsidian ProjectSource in the same project");
    }

    let created = 0;
    let updated = 0;
    let linked = 0;
    for (const candidate of candidates) {
      if (candidate.status !== "proposed") throw new Error("Phase 6A TopicCandidate manifests must start as proposed");
      const topicKey = { projectId_title: { projectId, title: candidate.title } };
      const existing = await transaction.topicCandidate.findUnique({ where: topicKey });
      const topic = await transaction.topicCandidate.upsert({
        where: topicKey,
        update: {
            targetAudience: candidate.targetAudience,
            userPainPoint: candidate.userPainPoint,
            coreAngle: candidate.coreAngle,
            evidenceStrength: candidate.evidenceStrength,
            freshness: candidate.freshness,
            suggestedPlatformsJson: JSON.stringify(candidate.suggestedPlatforms),
            riskFlagsJson: JSON.stringify(candidate.riskFlags),
            sourceCategory: OBSIDIAN_SOURCE_CATEGORY,
            factEligibility: OBSIDIAN_FACT_ELIGIBILITY,
          },
        create: {
            projectId,
            title: candidate.title,
            targetAudience: candidate.targetAudience,
            userPainPoint: candidate.userPainPoint,
            coreAngle: candidate.coreAngle,
            evidenceStrength: candidate.evidenceStrength,
            freshness: candidate.freshness,
            suggestedPlatformsJson: JSON.stringify(candidate.suggestedPlatforms),
            riskFlagsJson: JSON.stringify(candidate.riskFlags),
            sourceCategory: OBSIDIAN_SOURCE_CATEGORY,
            factEligibility: OBSIDIAN_FACT_ELIGIBILITY,
            status: "proposed",
          },
      });
      if (existing) updated += 1;
      else created += 1;

      const desiredSources: Array<{ id: string; index: number }> = [];
      for (const [index, candidatePath] of candidate.relatedSourceRelativePaths.entries()) {
        const relativePath = normalizeVaultRelativePath(candidatePath);
        if (!selectedSourceId || !relativePath || relativePath !== candidatePath) continue;
        const sourceItem = await transaction.sourceItem.findUnique({
          where: { projectSourceId_relativePath: { projectSourceId: selectedSourceId, relativePath } },
        });
        if (!sourceItem || sourceItem.sourceType !== "obsidian_vault" || sourceItem.sourceCategory !== OBSIDIAN_SOURCE_CATEGORY || sourceItem.factEligibility !== OBSIDIAN_FACT_ELIGIBILITY || hasQuarantineRisk(sourceItem.riskFlagsJson)) continue;
        desiredSources.push({ id: sourceItem.id, index });
      }

      if (selectedSourceId) {
        const desiredIds = new Set(desiredSources.map((source) => source.id));
        const currentManifestRelations = await transaction.topicCandidateSource.findMany({
          where: { topicCandidateId: topic.id, relevance: "manifest reference" },
          include: { sourceItem: { select: { projectSourceId: true } } },
        });
        const staleIds = currentManifestRelations.filter((relation) => relation.sourceItem.projectSourceId === selectedSourceId && !desiredIds.has(relation.sourceItemId)).map((relation) => relation.id);
        if (staleIds.length) await transaction.topicCandidateSource.deleteMany({ where: { id: { in: staleIds } } });
      }

      for (const desiredSource of desiredSources) {
        const { id: sourceItemId, index } = desiredSource;
        const relationKey = { topicCandidateId_sourceItemId: { topicCandidateId: topic.id, sourceItemId } };
        const relation = await transaction.topicCandidateSource.findUnique({ where: relationKey });
        await transaction.topicCandidateSource.upsert({
          where: relationKey,
          update: {
            relevance: "manifest reference",
            sourceRole: index === 0 ? "primary_reference" : "supporting_reference",
          },
          create: {
            topicCandidateId: topic.id,
            sourceItemId,
            relevance: "manifest reference",
            sourceRole: index === 0 ? "primary_reference" : "supporting_reference",
          },
        });
        if (!relation) linked += 1;
      }
    }
    return { created, updated, linked };
  }));
}

export async function updateTopicCandidateStatus(
  prisma: PrismaClient,
  topicId: string,
  status: "shortlisted" | "rejected" | "proposed",
) {
  const expectedStatus = status === "proposed" ? "rejected" : "proposed";
  const updated = await prisma.topicCandidate.updateMany({ where: { id: topicId, status: expectedStatus }, data: { status } });
  if (updated.count === 0) {
    const current = await prisma.topicCandidate.findUnique({ where: { id: topicId }, select: { status: true } });
    if (!current) throw new TopicCandidateNotFoundError();
    throw new TopicCandidateTransitionError(current.status, status);
  }
  return prisma.topicCandidate.findUniqueOrThrow({ where: { id: topicId } });
}

export class TopicCandidateNotFoundError extends Error {
  constructor() { super("TopicCandidate not found"); }
}

export class TopicCandidateTransitionError extends Error {
  constructor(from: string, to: string) { super(`Unsupported TopicCandidate transition: ${from} -> ${to}`); }
}

function asDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isImportableNote(note: ObsidianNoteScan): boolean {
  const normalizedPath = normalizeVaultRelativePath(note.relativePath);
  return note.isSourceItemCandidate
    && note.isValid
    && Boolean(note.sourceUrl && /^https?:\/\//i.test(note.sourceUrl))
    && !note.isQuarantined
    && !isQuarantined(note.riskFlags)
    && !note.riskFlags.includes("unknown_source")
    && normalizedPath === note.relativePath
    && redactRelativePath(note.relativePath) === note.relativePath
    && redactSensitiveText(note.title) === note.title
    && note.sourceCategory === OBSIDIAN_SOURCE_CATEGORY
    && note.factEligibility === OBSIDIAN_FACT_ELIGIBILITY;
}

function boundedSummary(value: string): string {
  return toSafeResearchSummary(value);
}

function hasQuarantineRisk(value: string | null): boolean {
  if (!value) return false;
  try {
    const flags = JSON.parse(value);
    return Array.isArray(flags) && isQuarantined(flags);
  } catch {
    return true;
  }
}

async function withStagingRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableWriteConflict(error) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
  throw lastError;
}

function isRetryableWriteConflict(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return ["P1008", "P2002", "P2034"].includes(code)
    || message.includes("operation has timed out")
    || message.includes("database is locked")
    || message.includes("sqlite_busy")
    || message.includes("unique constraint");
}
