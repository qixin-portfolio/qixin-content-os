import type { Prisma, PrismaClient } from "@prisma/client";
import { isAbsolute } from "node:path";
import { createAssetBrief } from "./asset-brief-service";
import {
  createPublishChecklist,
  parsePublishChecklist,
} from "./checklist-service";
import { sha256, stableJson } from "./serialization";

type PublicationDatabase = PrismaClient | Prisma.TransactionClient;

const packageLocks = new Map<string, Promise<unknown>>();
const packageRetryDelaysMs = [50, 100];

type CreatePackageOptions = { now?: Date };

type StatusInput = {
  status: "ready" | "exported" | "published" | "archived";
  publishedAt?: Date;
  publishedUrl?: string;
  publishNotes?: string;
};

async function withPackageLock<T>(editorialDraftId: string, operation: () => Promise<T>) {
  const previous = packageLocks.get(editorialDraftId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  packageLocks.set(editorialDraftId, current);
  try {
    return await current;
  } finally {
    if (packageLocks.get(editorialDraftId) === current) packageLocks.delete(editorialDraftId);
  }
}

function isRetryablePackageConflict(error: unknown) {
  const code = error && typeof error === "object" && "code" in error
    ? String(error.code)
    : "";
  if (["P1008", "P2002", "P2028", "P2034"].includes(code)) return true;
  const message = error instanceof Error ? error.message : "";
  return /database is (?:locked|busy)|operation has timed out/i.test(message);
}

function wait(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function nullableText(value: string) {
  return value === "" ? null : value;
}

function textsMatch(
  left: { title: string; hook: string; body: string; cta: string },
  right: { title: string; hook: string; body: string; cta: string },
) {
  return left.title === right.title
    && left.hook === right.hook
    && left.body === right.body
    && left.cta === right.cta;
}

function safeSourceReference(sourceUrl: string | null, sourcePath: string | null) {
  if (sourceUrl && /^https?:\/\//.test(sourceUrl)) return sourceUrl;
  if (sourcePath && !isAbsolute(sourcePath)) return sourcePath;
  return null;
}

function splitChineseList(value: string) {
  return value
    .split(/、|和/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function createFactBoundary(event: {
  whatHappened: string;
  problem: string;
  result: string;
}) {
  const confirmedMatch = event.whatHappened.match(/已形成(.+?)(?:等产品资料|。|$)/);
  const confirmedFacts = confirmedMatch
    ? splitChineseList(confirmedMatch[1]).map((fact) => `${fact}已经形成`)
    : [event.whatHappened];
  const missingMatch = event.problem.match(/当前缺少(.+?)(?:。|$)/);
  const missingEvidence = missingMatch
    ? splitChineseList(missingMatch[1]).map((item) => item === "代码路径" ? "代码路径整理" : item)
    : [event.problem];
  const unverifiedClaims = event.result.includes("不能确认")
    ? ["是否正式上线", "是否已有客户", "用户数量结果", "收入结果"]
    : [];
  return {
    confirmedFacts,
    unverifiedClaims,
    prohibitedClaims: ["已正式上线", "已有客户", "用户数量", "收入结果"],
    missingEvidence,
  };
}

async function findExistingPackage(
  prisma: PublicationDatabase,
  sourceRevisionId: string,
  platform: "wechat_moments" | "x" | "xiaohongshu" | "douyin",
) {
  return prisma.publicationPackage.findUnique({
    where: { sourceRevisionId_platform: { sourceRevisionId, platform } },
  });
}

export async function createPublicationPackage(
  prisma: PrismaClient,
  editorialDraftId: string,
  options: CreatePackageOptions = {},
) {
  return withPackageLock(editorialDraftId, async () => {
    let sourceRevisionId: string | undefined;
    let platform: "wechat_moments" | "x" | "xiaohongshu" | "douyin" | undefined;
    for (let attempt = 0; attempt <= packageRetryDelaysMs.length; attempt += 1) {
      try {
        return await prisma.$transaction(async (transaction) => {
          const draft = await transaction.editorialDraft.findUnique({
            where: { id: editorialDraftId },
            include: {
              currentRevision: true,
              masterContent: {
                include: {
                  eventCard: {
                    include: {
                      project: true,
                      sourceItems: true,
                      assets: true,
                    },
                  },
                },
              },
            },
          });
          if (!draft) throw new Error("EditorialDraft not found");
          if (draft.status !== "approved" || !draft.approvedAt) {
            throw new Error("Only an approved EditorialDraft can create a publication package");
          }
          const approvalRevision = draft.currentRevision;
          if (
            !approvalRevision
            || approvalRevision.changeSource !== "human_approval"
            || !approvalRevision.approvedSourceRevisionId
          ) {
            throw new Error("Approved EditorialDraft has an incomplete approval Revision relation");
          }
          sourceRevisionId = approvalRevision.approvedSourceRevisionId;
          platform = draft.platform;
          const existing = await findExistingPackage(transaction, sourceRevisionId, platform);
          if (existing) return { package: existing, idempotent: true };

          const sourceRevision = await transaction.draftRevision.findUnique({
            where: { id: sourceRevisionId },
          });
          if (
            !sourceRevision
            || sourceRevision.editorialDraftId !== draft.id
            || sourceRevision.changeSource === "human_approval"
          ) {
            throw new Error("Approved source Revision relation is invalid");
          }
          const revisionMatches = textsMatch(sourceRevision, approvalRevision)
            && textsMatch(approvalRevision, draft);
          if (!revisionMatches) throw new Error("Approved Revision text does not match EditorialDraft");

          const now = options.now ?? new Date();
          const sourceItems = [...draft.masterContent.eventCard.sourceItems]
            .sort((left, right) => left.id.localeCompare(right.id))
            .map((item) => ({
              id: item.id,
              type: item.sourceType,
              title: item.title,
              sourceReference: safeSourceReference(item.sourceUrl, item.sourcePath),
              contentHash: sha256(item.content),
            }));
          const evidenceSnapshot = {
            editorialDraftId: draft.id,
            sourceRevisionId,
            approvalRevisionId: approvalRevision.id,
            masterContentId: draft.masterContent.id,
            eventCardId: draft.masterContent.eventCard.id,
            sourceItems,
            approvalTimestamp: draft.approvedAt.toISOString(),
            packageCreationTimestamp: now.toISOString(),
          };
          const factBoundary = createFactBoundary(draft.masterContent.eventCard);
          const assetBrief = createAssetBrief(draft.masterContent.eventCard.assets);
          const finalText = [approvalRevision.hook, approvalRevision.body, approvalRevision.cta]
            .filter(Boolean)
            .join("\n\n");
          const checklist = createPublishChecklist({
            approved: true,
            revisionMatches,
            evidenceSourceCount: sourceItems.length,
            finalText,
          });
          const title = nullableText(approvalRevision.title);
          const hook = nullableText(approvalRevision.hook);
          const cta = nullableText(approvalRevision.cta);
          const packageHash = sha256(stableJson({
            platform: draft.platform,
            title,
            hook,
            body: approvalRevision.body,
            cta,
            evidenceSnapshot,
          }));
          const publicationPackage = await transaction.publicationPackage.create({
            data: {
              editorialDraftId: draft.id,
              sourceRevisionId,
              approvalRevisionId: approvalRevision.id,
              platform: draft.platform,
              title,
              hook,
              body: approvalRevision.body,
              cta,
              evidenceSnapshotJson: stableJson(evidenceSnapshot),
              factBoundaryJson: stableJson(factBoundary),
              assetBriefJson: stableJson(assetBrief),
              publishChecklistJson: stableJson(checklist),
              packageHash,
              createdAt: now,
              updatedAt: now,
            },
          });
          return { package: publicationPackage, idempotent: false };
        });
      } catch (error) {
        if (sourceRevisionId && platform) {
          const existing = await findExistingPackage(prisma, sourceRevisionId, platform);
          if (existing) return { package: existing, idempotent: true };
        }
        const retryDelay = packageRetryDelaysMs[attempt];
        if (retryDelay === undefined || !isRetryablePackageConflict(error)) throw error;
        await wait(retryDelay);
      }
    }
    throw new Error("Publication package retry limit reached");
  });
}

export async function updatePublicationStatus(
  prisma: PrismaClient,
  publicationPackageId: string,
  input: StatusInput,
) {
  const publicationPackage = await prisma.publicationPackage.findUniqueOrThrow({
    where: { id: publicationPackageId },
    include: { editorialDraft: { include: { currentRevision: true } } },
  });
  if (input.status !== "published") {
    return prisma.publicationPackage.update({
      where: { id: publicationPackageId },
      data: { status: input.status },
    });
  }
  if (!input.publishedAt || Number.isNaN(input.publishedAt.getTime())) {
    throw new Error("publishedAt is required when status is published");
  }
  if (
    publicationPackage.editorialDraft.status !== "approved"
    || publicationPackage.editorialDraft.currentRevisionId !== publicationPackage.approvalRevisionId
  ) {
    throw new Error("Publication package no longer points to the current approved Revision");
  }
  const checklist = parsePublishChecklist(publicationPackage.publishChecklistJson);
  const incompleteAutomatic = checklist.items.filter(
    ({ kind, completed }) => kind === "automatic" && !completed,
  );
  if (incompleteAutomatic.length > 0) throw new Error("Automatic publication checks are incomplete");
  const incompleteManual = checklist.items.filter(
    ({ kind, completed }) => kind === "manual" && !completed,
  );
  if (incompleteManual.length > 0) throw new Error("All manual publication checks are required");

  return prisma.publicationPackage.update({
    where: { id: publicationPackageId },
    data: {
      status: "published",
      publishedAt: input.publishedAt,
      publishedUrl: input.publishedUrl?.trim() || null,
      publishNotes: input.publishNotes?.trim() || null,
    },
  });
}
