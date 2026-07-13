import { describe, expect, it } from "vitest";
import {
  createPublicationPackage,
  updatePublicationStatus,
} from "../../src/lib/publication/package-service";
import { updateManualChecklist } from "../../src/lib/publication/checklist-service";
import { sha256, stableJson } from "../../src/lib/publication/serialization";
import {
  createPublicationTestContext,
  disposePublicationTestContext,
} from "./fixtures";

const fixedNow = new Date("2026-07-13T08:00:00.000Z");

describe("publication package service", () => {
  it("creates a publication package only from the approved revision chain", async () => {
    const context = await createPublicationTestContext("approved");
    try {
      const revisionCount = await context.prisma.draftRevision.count();
      const voiceSampleCount = await context.prisma.voiceSample.count();
      const result = await createPublicationPackage(context.prisma, context.approvedDraftId, {
        now: fixedNow,
      });
      const source = await context.prisma.draftRevision.findUniqueOrThrow({
        where: { id: context.sourceRevisionId },
      });

      expect(result.idempotent).toBe(false);
      expect(result.package.status).toBe("ready");
      expect(result.package.sourceRevisionId).toBe(context.sourceRevisionId);
      expect(result.package.approvalRevisionId).toBe(context.approvalRevisionId);
      expect(result.package.body).toBe(source.body);
      expect(result.package.hook).toBeNull();
      expect(result.package.cta).toBeNull();
      expect(await context.prisma.draftRevision.count()).toBe(revisionCount);
      expect(await context.prisma.voiceSample.count()).toBe(voiceSampleCount);
    } finally {
      await disposePublicationTestContext(context);
    }
  });

  it("rejects an EditorialDraft that is not approved", async () => {
    const context = await createPublicationTestContext("unapproved");
    try {
      await expect(createPublicationPackage(
        context.prisma,
        context.unapprovedDraftId,
      )).rejects.toThrow("approved");
      expect(await context.prisma.publicationPackage.count()).toBe(0);
    } finally {
      await disposePublicationTestContext(context);
    }
  });

  it("returns the same package for repeated and concurrent creation", async () => {
    const context = await createPublicationTestContext("idempotent");
    try {
      const first = await createPublicationPackage(context.prisma, context.approvedDraftId, { now: fixedNow });
      const second = await createPublicationPackage(context.prisma, context.approvedDraftId);
      const [third, fourth] = await Promise.all([
        createPublicationPackage(context.prisma, context.approvedDraftId),
        createPublicationPackage(context.prisma, context.approvedDraftId),
      ]);

      expect(first.idempotent).toBe(false);
      expect(second.idempotent).toBe(true);
      expect(new Set([first, second, third, fourth].map(({ package: item }) => item.id)).size).toBe(1);
      expect(new Set([first, second, third, fourth].map(({ package: item }) => item.packageHash)).size).toBe(1);
      expect(await context.prisma.publicationPackage.count()).toBe(1);
    } finally {
      await disposePublicationTestContext(context);
    }
  });

  it("stores a source snapshot without private paths and keeps it frozen", async () => {
    const context = await createPublicationTestContext("snapshot");
    try {
      const result = await createPublicationPackage(context.prisma, context.approvedDraftId, { now: fixedNow });
      const snapshotBefore = JSON.parse(result.package.evidenceSnapshotJson) as {
        editorialDraftId: string;
        sourceRevisionId: string;
        approvalRevisionId: string;
        masterContentId: string;
        eventCardId: string;
        sourceItems: Array<{ id: string; sourceReference: string | null; contentHash: string }>;
        approvalTimestamp: string;
        packageCreationTimestamp: string;
      };

      expect(snapshotBefore.editorialDraftId).toBe(context.approvedDraftId);
      expect(snapshotBefore.sourceRevisionId).toBe(context.sourceRevisionId);
      expect(snapshotBefore.approvalRevisionId).toBe(context.approvalRevisionId);
      expect(snapshotBefore.masterContentId).toBe(context.master.id);
      expect(snapshotBefore.eventCardId).toBe(context.event.id);
      expect(snapshotBefore.sourceItems).toHaveLength(4);
      expect(snapshotBefore.sourceItems.every((item) => /^[a-f0-9]{64}$/.test(item.contentHash))).toBe(true);
      expect(JSON.stringify(snapshotBefore)).not.toContain("/Users/private");
      const approvedDraft = await context.prisma.editorialDraft.findUniqueOrThrow({
        where: { id: context.approvedDraftId },
      });
      expect(snapshotBefore.approvalTimestamp).toBe(approvedDraft.approvedAt?.toISOString());
      expect(snapshotBefore.packageCreationTimestamp).toBe(fixedNow.toISOString());
      expect(result.package.packageHash).toBe(sha256(stableJson({
        platform: result.package.platform,
        title: result.package.title,
        hook: result.package.hook,
        body: result.package.body,
        cta: result.package.cta,
        evidenceSnapshot: snapshotBefore,
      })));

      await context.prisma.sourceItem.update({
        where: { id: context.sourceItems[0].id },
        data: { content: "后续修改，不应进入旧快照。" },
      });
      const stored = await context.prisma.publicationPackage.findUniqueOrThrow({
        where: { id: result.package.id },
      });
      expect(stored.evidenceSnapshotJson).toBe(result.package.evidenceSnapshotJson);
      expect(stored.packageHash).toBe(result.package.packageHash);
    } finally {
      await disposePublicationTestContext(context);
    }
  });

  it("builds the transparent construction fact boundary and an honest asset brief", async () => {
    const context = await createPublicationTestContext("boundaries");
    try {
      const { package: publicationPackage } = await createPublicationPackage(
        context.prisma,
        context.approvedDraftId,
      );
      const boundary = JSON.parse(publicationPackage.factBoundaryJson) as {
        confirmedFacts: string[];
        unverifiedClaims: string[];
        prohibitedClaims: string[];
        missingEvidence: string[];
      };
      const brief = JSON.parse(publicationPackage.assetBriefJson) as {
        recommendedAssetType: string[];
        existingAssetIds: string[];
        missingAssets: string[];
        avoidElements: string[];
      };

      expect(boundary.confirmedFacts).toEqual([
        "产品一页纸已经形成",
        "功能模块清单已经形成",
        "行业案例说明已经形成",
      ]);
      expect(boundary.missingEvidence).toEqual([
        "截图",
        "后台版本记录",
        "代码路径整理",
        "真实项目案例",
      ]);
      expect(boundary.prohibitedClaims).toEqual([
        "已正式上线",
        "已有客户",
        "用户数量",
        "收入结果",
      ]);
      expect(boundary.unverifiedClaims.length).toBeGreaterThan(0);
      expect(brief.recommendedAssetType).toEqual([
        "产品页面截图",
        "功能模块界面",
        "资料整理过程照片",
      ]);
      expect(brief.existingAssetIds).toEqual([]);
      expect(brief.missingAssets).toContain("当前没有已确认可发布的真实项目截图");
      expect(brief.avoidElements).toContain("虚构客户截图");
      expect(brief.avoidElements).toContain("虚构用户数据界面");
    } finally {
      await disposePublicationTestContext(context);
    }
  });

  it("separates automatic and manual checklist items", async () => {
    const context = await createPublicationTestContext("checklist");
    try {
      const { package: publicationPackage } = await createPublicationPackage(
        context.prisma,
        context.approvedDraftId,
      );
      const checklist = JSON.parse(publicationPackage.publishChecklistJson) as {
        items: Array<{ id: string; kind: "automatic" | "manual"; completed: boolean }>;
      };
      const automatic = checklist.items.filter(({ kind }) => kind === "automatic");
      const manual = checklist.items.filter(({ kind }) => kind === "manual");

      expect(automatic.length).toBeGreaterThan(0);
      expect(automatic.every(({ completed }) => completed)).toBe(true);
      expect(manual.map(({ completed }) => completed)).toEqual(manual.map(() => false));
    } finally {
      await disposePublicationTestContext(context);
    }
  });

  it("does not allow VoiceSample IDs to bypass the EditorialDraft relation", async () => {
    const context = await createPublicationTestContext("voice-sample-bypass");
    try {
      const imported = await context.prisma.voiceSample.create({
        data: {
          voiceProfileId: (await context.prisma.voiceProfile.findFirstOrThrow({
            where: { platform: "wechat_moments" },
          })).id,
          platform: "wechat_moments",
          title: "导入样本",
          body: "导入样本不能创建发布包。",
          sourceType: "imported_post",
          sourceReferenceId: "imported-test",
          qualityRating: 4,
          notes: "测试",
          approved: true,
        },
      });

      await expect(createPublicationPackage(context.prisma, imported.id)).rejects.toThrow();
      await expect(createPublicationPackage(
        context.prisma,
        context.approvedVoiceSampleId,
      )).rejects.toThrow();
      expect(await context.prisma.publicationPackage.count()).toBe(0);
    } finally {
      await disposePublicationTestContext(context);
    }
  });

  it("rolls back package creation when the database insert fails", async () => {
    const context = await createPublicationTestContext("rollback");
    try {
      await context.prisma.$executeRawUnsafe(`
        CREATE TRIGGER fail_publication_package
        BEFORE INSERT ON PublicationPackage
        BEGIN
          SELECT RAISE(ABORT, 'forced publication package failure');
        END;
      `);
      await expect(createPublicationPackage(
        context.prisma,
        context.approvedDraftId,
      )).rejects.toThrow();
      expect(await context.prisma.publicationPackage.count()).toBe(0);
      expect(await context.prisma.publicationExport.count()).toBe(0);
    } finally {
      await disposePublicationTestContext(context);
    }
  });

  it("allows a later approved source Revision to create a second package", async () => {
    const context = await createPublicationTestContext("new-source");
    try {
      const first = await createPublicationPackage(context.prisma, context.approvedDraftId);
      await context.prisma.editorialDraft.update({
        where: { id: context.approvedDraftId },
        data: { status: "editing", approvedAt: null },
      });
      const nextSource = await context.prisma.draftRevision.create({
        data: {
          editorialDraftId: context.approvedDraftId,
          revisionNumber: 4,
          title: "第二个批准源",
          body: first.package.body,
          hook: "",
          cta: "",
          changeSource: "human_edit",
          changeSummary: "测试第二个发布包源版本",
        },
      });
      await context.prisma.editorialDraft.update({
        where: { id: context.approvedDraftId },
        data: {
          title: nextSource.title,
          body: nextSource.body,
          hook: nextSource.hook,
          cta: nextSource.cta,
          currentRevisionId: nextSource.id,
        },
      });
      const { approveEditorialDraft } = await import("../../src/lib/editorial/revision-service");
      await approveEditorialDraft(context.prisma, context.approvedDraftId, {
        overrideReason: "测试第二个批准源",
      });
      const second = await createPublicationPackage(context.prisma, context.approvedDraftId);

      expect(second.package.id).not.toBe(first.package.id);
      expect(second.package.sourceRevisionId).toBe(nextSource.id);
      expect(await context.prisma.publicationPackage.count()).toBe(2);
    } finally {
      await disposePublicationTestContext(context);
    }
  });

  it("requires every manual check before marking published and allows an empty URL", async () => {
    const context = await createPublicationTestContext("publish-state");
    try {
      const { package: publicationPackage } = await createPublicationPackage(
        context.prisma,
        context.approvedDraftId,
      );
      await expect(updatePublicationStatus(context.prisma, publicationPackage.id, {
        status: "published",
        publishedAt: fixedNow,
      })).rejects.toThrow("manual");

      const checklist = JSON.parse(publicationPackage.publishChecklistJson) as {
        items: Array<{ id: string; kind: "automatic" | "manual" }>;
      };
      const manualIds = checklist.items.filter(({ kind }) => kind === "manual").map(({ id }) => id);
      await updateManualChecklist(context.prisma, publicationPackage.id, manualIds);
      await expect(updatePublicationStatus(context.prisma, publicationPackage.id, {
        status: "published",
      })).rejects.toThrow("publishedAt");
      const published = await updatePublicationStatus(context.prisma, publicationPackage.id, {
        status: "published",
        publishedAt: fixedNow,
        publishNotes: "人工记录测试",
      });

      expect(published.status).toBe("published");
      expect(published.publishedAt?.toISOString()).toBe(fixedNow.toISOString());
      expect(published.publishedUrl).toBeNull();
    } finally {
      await disposePublicationTestContext(context);
    }
  });
});
