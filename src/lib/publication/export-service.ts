import type { PrismaClient } from "@prisma/client";
import { parsePublishChecklist } from "./checklist-service.ts";
import { sha256 } from "./serialization.ts";

type ExportFormat = "txt" | "markdown" | "json";

function safeFileSegment(value: string, fallback: string) {
  const sanitized = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return sanitized || fallback;
}

function finalCopy(publicationPackage: { hook: string | null; body: string; cta: string | null }) {
  return [publicationPackage.hook, publicationPackage.body, publicationPackage.cta]
    .filter(Boolean)
    .join("\n\n");
}

function list(items: string[]) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- 无";
}

function markdownContent(publicationPackage: {
  title: string | null;
  platform: string;
  hook: string | null;
  body: string;
  cta: string | null;
  evidenceSnapshotJson: string;
  factBoundaryJson: string;
  assetBriefJson: string;
  publishChecklistJson: string;
}) {
  const evidence = JSON.parse(publicationPackage.evidenceSnapshotJson) as {
    sourceItems: Array<{ id: string; type: string; title: string; sourceReference: string | null; contentHash: string }>;
  };
  const boundary = JSON.parse(publicationPackage.factBoundaryJson) as {
    confirmedFacts: string[];
    unverifiedClaims: string[];
    prohibitedClaims: string[];
    missingEvidence: string[];
  };
  const brief = JSON.parse(publicationPackage.assetBriefJson) as {
    recommendedAssetType: string[];
    purpose: string;
    requiredElements: string[];
    optionalElements: string[];
    avoidElements: string[];
    existingAssetIds: string[];
    missingAssets: string[];
    privacyRisks: string[];
    suggestedCount: number;
    suggestedAspectRatio: string[];
  };
  const checklist = parsePublishChecklist(publicationPackage.publishChecklistJson);
  return [
    `# ${publicationPackage.title ?? "无标题"}`,
    "",
    `平台：${publicationPackage.platform}`,
    "",
    "## 最终文案",
    "",
    finalCopy(publicationPackage),
    "",
    "## 配图需求",
    "",
    brief.purpose,
    "",
    `建议类型：\n${list(brief.recommendedAssetType)}`,
    "",
    `必须包含：\n${list(brief.requiredElements)}`,
    "",
    `避免内容：\n${list(brief.avoidElements)}`,
    "",
    `缺少资产：\n${list(brief.missingAssets)}`,
    "",
    `建议数量：${brief.suggestedCount}；画面比例：${brief.suggestedAspectRatio.join("、")}`,
    "",
    "## 事实边界",
    "",
    `已确认事实：\n${list(boundary.confirmedFacts)}`,
    "",
    `未验证声明：\n${list(boundary.unverifiedClaims)}`,
    "",
    `禁止声明：\n${list(boundary.prohibitedClaims)}`,
    "",
    `缺少证据：\n${list(boundary.missingEvidence)}`,
    "",
    "## 发布检查单",
    "",
    checklist.items.map((item) => `- [${item.completed ? "x" : " "}] ${item.label}（${item.kind === "automatic" ? "自动" : "人工"}）`).join("\n"),
    "",
    "## 证据来源摘要",
    "",
    evidence.sourceItems.map((item) => [
      `- ${item.title}（${item.type}）`,
      `  - ID：${item.id}`,
      `  - 引用：${item.sourceReference ?? "无公开引用"}`,
      `  - 内容哈希：${item.contentHash}`,
    ].join("\n")).join("\n"),
    "",
  ].join("\n");
}

function jsonContent(publicationPackage: {
  id: string;
  editorialDraftId: string;
  sourceRevisionId: string;
  approvalRevisionId: string;
  platform: string;
  title: string | null;
  hook: string | null;
  body: string;
  cta: string | null;
  status: string;
  packageHash: string;
  publishedAt: Date | null;
  publishedUrl: string | null;
  publishNotes: string | null;
  evidenceSnapshotJson: string;
  factBoundaryJson: string;
  assetBriefJson: string;
  publishChecklistJson: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return JSON.stringify({
    package: {
      id: publicationPackage.id,
      editorialDraftId: publicationPackage.editorialDraftId,
      sourceRevisionId: publicationPackage.sourceRevisionId,
      approvalRevisionId: publicationPackage.approvalRevisionId,
      platform: publicationPackage.platform,
      title: publicationPackage.title,
      hook: publicationPackage.hook,
      body: publicationPackage.body,
      cta: publicationPackage.cta,
      status: publicationPackage.status,
      packageHash: publicationPackage.packageHash,
      publishedAt: publicationPackage.publishedAt?.toISOString() ?? null,
      publishedUrl: publicationPackage.publishedUrl,
      publishNotes: publicationPackage.publishNotes,
      createdAt: publicationPackage.createdAt.toISOString(),
      updatedAt: publicationPackage.updatedAt.toISOString(),
    },
    evidenceSnapshot: JSON.parse(publicationPackage.evidenceSnapshotJson),
    factBoundary: JSON.parse(publicationPackage.factBoundaryJson),
    assetBrief: JSON.parse(publicationPackage.assetBriefJson),
    publishChecklist: JSON.parse(publicationPackage.publishChecklistJson),
  }, null, 2);
}

export async function exportPublicationPackage(
  prisma: PrismaClient,
  publicationPackageId: string,
  format: ExportFormat,
  options: { now?: Date } = {},
) {
  return prisma.$transaction(async (transaction) => {
    const stored = await transaction.publicationPackage.findUniqueOrThrow({
      where: { id: publicationPackageId },
      include: {
        editorialDraft: {
          include: {
            masterContent: { include: { eventCard: { include: { project: true } } } },
          },
        },
      },
    });
    const publicationPackage = stored.status === "ready"
      ? await transaction.publicationPackage.update({
        where: { id: publicationPackageId },
        data: { status: "exported" },
      })
      : stored;
    const now = options.now ?? new Date();
    const platformName = safeFileSegment(
      publicationPackage.platform.replaceAll("_", "-"),
      "platform",
    );
    const projectSlug = safeFileSegment(
      stored.editorialDraft.masterContent.eventCard.project.slug,
      "project",
    );
    const extension = format === "markdown" ? "md" : format;
    const fileName = `${now.toISOString().slice(0, 10)}-${platformName}-${projectSlug}.${extension}`;
    const content = format === "txt"
      ? finalCopy(publicationPackage)
      : format === "markdown"
        ? markdownContent(publicationPackage)
        : jsonContent(publicationPackage);
    const contentHash = sha256(content);
    const record = await transaction.publicationExport.create({
      data: {
        publicationPackageId,
        format,
        fileName,
        contentHash,
        createdAt: now,
      },
    });
    return { record, content, fileName, contentHash };
  });
}
