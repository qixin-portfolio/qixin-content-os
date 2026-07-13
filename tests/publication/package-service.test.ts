import { spawn } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { exportPublicationPackage } from "../../src/lib/publication/export-service";
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

type IsolatedPackageResult = {
  ok: boolean;
  result?: { packageId: string; packageHash: string; idempotent: boolean };
  error?: { code?: string; message: string };
};

function createPackageFromIsolatedProcess(
  databasePath: string,
  editorialDraftId: string,
  startAt: number,
): Promise<IsolatedPackageResult> {
  const packageServiceUrl = pathToFileURL(
    join(process.cwd(), "src/lib/publication/package-service.ts"),
  ).href;
  const script = `
    import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
    import { PrismaClient } from "@prisma/client";
    import { createPublicationPackage } from ${JSON.stringify(packageServiceUrl)};
    const [databasePath, editorialDraftId, startAtValue] = process.argv.slice(1);
    const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databasePath }) });
    const waitMs = Math.max(0, Number(startAtValue) - Date.now());
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    try {
      const result = await createPublicationPackage(prisma, editorialDraftId);
      process.stdout.write(JSON.stringify({
        ok: true,
        result: {
          packageId: result.package.id,
          packageHash: result.package.packageHash,
          idempotent: result.idempotent,
        },
      }));
    } catch (error) {
      process.stdout.write(JSON.stringify({
        ok: false,
        error: {
          code: error && typeof error === "object" && "code" in error ? String(error.code) : undefined,
          message: error instanceof Error ? error.message : "Unknown publication package error",
        },
      }));
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  `;

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      script,
      databasePath,
      editorialDraftId,
      String(startAt),
    ], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", () => {
      try {
        resolve(JSON.parse(stdout) as IsolatedPackageResult);
      } catch {
        reject(new Error(`Isolated package creation returned invalid output: ${stderr || stdout}`));
      }
    });
  });
}

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

  it("returns the same package across five sequential calls", async () => {
    const context = await createPublicationTestContext("idempotent");
    try {
      const results = [];
      for (let attempt = 0; attempt < 5; attempt += 1) {
        results.push(await createPublicationPackage(
          context.prisma,
          context.approvedDraftId,
          attempt === 0 ? { now: fixedNow } : {},
        ));
      }

      expect(results.map(({ idempotent }) => idempotent)).toEqual([false, true, true, true, true]);
      expect(new Set(results.map(({ package: item }) => item.id)).size).toBe(1);
      expect(new Set(results.map(({ package: item }) => item.packageHash)).size).toBe(1);
      expect(await context.prisma.publicationPackage.count()).toBe(1);
    } finally {
      await disposePublicationTestContext(context);
    }
  });

  it("uses database uniqueness across isolated clients without a shared memory lock", async () => {
    const context = await createPublicationTestContext("cross-instance");
    try {
      const startAt = Date.now() + 500;
      const [first, second] = await Promise.all([
        createPackageFromIsolatedProcess(context.databasePath, context.approvedDraftId, startAt),
        createPackageFromIsolatedProcess(context.databasePath, context.approvedDraftId, startAt),
      ]);

      expect(first, JSON.stringify(first)).toMatchObject({ ok: true });
      expect(second, JSON.stringify(second)).toMatchObject({ ok: true });
      expect(second.result?.packageId).toBe(first.result?.packageId);
      expect(second.result?.packageHash).toBe(first.result?.packageHash);
      expect([first.result?.idempotent, second.result?.idempotent].sort()).toEqual([false, true]);
      expect(await context.prisma.publicationPackage.count()).toBe(1);
    } finally {
      await disposePublicationTestContext(context);
    }
  }, 15_000);

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
        sourceItems: Array<{ id: string; type: string; title: string; sourceReference: string | null; contentHash: string }>;
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
      const factBoundary = JSON.parse(result.package.factBoundaryJson);
      const assetBrief = JSON.parse(result.package.assetBriefJson);
      const publishChecklist = JSON.parse(result.package.publishChecklistJson);
      expect(result.package.packageHash).toBe(sha256(stableJson({
        platform: result.package.platform,
        title: result.package.title,
        hook: result.package.hook,
        body: result.package.body,
        cta: result.package.cta,
        sourceRevisionId: result.package.sourceRevisionId,
        approvalRevisionId: result.package.approvalRevisionId,
        evidenceSnapshot: snapshotBefore,
        factBoundary,
        assetBrief,
        publishChecklist,
      })));

      const reorderedSnapshot = {
        packageCreationTimestamp: snapshotBefore.packageCreationTimestamp,
        approvalTimestamp: snapshotBefore.approvalTimestamp,
        sourceItems: snapshotBefore.sourceItems.map((source) => ({
          contentHash: source.contentHash,
          sourceReference: source.sourceReference,
          id: source.id,
          title: source.title,
          type: source.type,
        })),
        eventCardId: snapshotBefore.eventCardId,
        masterContentId: snapshotBefore.masterContentId,
        approvalRevisionId: snapshotBefore.approvalRevisionId,
        sourceRevisionId: snapshotBefore.sourceRevisionId,
        editorialDraftId: snapshotBefore.editorialDraftId,
      };
      expect(stableJson(reorderedSnapshot)).toBe(stableJson(snapshotBefore));

      await context.prisma.sourceItem.update({
        where: { id: context.sourceItems[0].id },
        data: {
          title: "后续标题，不应进入旧快照",
          content: "后续修改，不应进入旧快照。",
          sourceUrl: "https://example.com/changed-after-package",
          sourcePath: "/Users/private/changed-after-package.md",
        },
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

  it("keeps the database uniqueness key composite while the service remains draft-platform bound", async () => {
    const context = await createPublicationTestContext("composite-key");
    try {
      const { package: first } = await createPublicationPackage(context.prisma, context.approvedDraftId);
      const second = await context.prisma.publicationPackage.create({
        data: {
          editorialDraftId: first.editorialDraftId,
          sourceRevisionId: first.sourceRevisionId,
          approvalRevisionId: first.approvalRevisionId,
          platform: "x",
          title: first.title,
          hook: first.hook,
          body: first.body,
          cta: first.cta,
          evidenceSnapshotJson: first.evidenceSnapshotJson,
          factBoundaryJson: first.factBoundaryJson,
          assetBriefJson: first.assetBriefJson,
          publishChecklistJson: first.publishChecklistJson,
          packageHash: first.packageHash,
        },
      });

      expect(second.platform).toBe("x");
      expect(await context.prisma.publicationPackage.count()).toBe(2);
      await expect(context.prisma.publicationPackage.create({
        data: {
          editorialDraftId: first.editorialDraftId,
          sourceRevisionId: first.sourceRevisionId,
          approvalRevisionId: first.approvalRevisionId,
          platform: first.platform,
          title: first.title,
          hook: first.hook,
          body: first.body,
          cta: first.cta,
          evidenceSnapshotJson: first.evidenceSnapshotJson,
          factBoundaryJson: first.factBoundaryJson,
          assetBriefJson: first.assetBriefJson,
          publishChecklistJson: first.publishChecklistJson,
          packageHash: first.packageHash,
        },
      })).rejects.toMatchObject({ code: "P2002" });
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
      await exportPublicationPackage(context.prisma, publicationPackage.id, "txt", { now: fixedNow });
      await expect(updatePublicationStatus(context.prisma, publicationPackage.id, {
        status: "published",
        publishedAt: fixedNow,
      })).rejects.toThrow("manual");

      const checklist = JSON.parse(publicationPackage.publishChecklistJson) as {
        items: Array<{ id: string; kind: "automatic" | "manual" }>;
      };
      const manualIds = checklist.items.filter(({ kind }) => kind === "manual").map(({ id }) => id);
      await expect(updatePublicationStatus(context.prisma, publicationPackage.id, {
        status: "ready",
      })).rejects.toThrow("transition");
      await updateManualChecklist(context.prisma, publicationPackage.id, manualIds.slice(0, -1));
      await expect(updatePublicationStatus(context.prisma, publicationPackage.id, {
        status: "published",
        publishedAt: fixedNow,
      })).rejects.toThrow("manual");
      await updateManualChecklist(context.prisma, publicationPackage.id, manualIds);
      await expect(updatePublicationStatus(context.prisma, publicationPackage.id, {
        status: "published",
      })).rejects.toThrow("publishedAt");
      const published = await updatePublicationStatus(context.prisma, publicationPackage.id, {
        status: "published",
        publishedAt: fixedNow,
      });
      const replay = await updatePublicationStatus(context.prisma, publicationPackage.id, {
        status: "published",
        publishedAt: new Date("2026-07-14T08:00:00.000Z"),
        publishedUrl: "https://example.com/should-not-overwrite",
        publishNotes: "不应覆盖首次发布记录",
      });

      expect(published.status).toBe("published");
      expect(published.publishedAt?.toISOString()).toBe(fixedNow.toISOString());
      expect(published.publishedUrl).toBeNull();
      expect(published.publishNotes).toBeNull();
      expect(replay.publishedAt?.toISOString()).toBe(fixedNow.toISOString());
      expect(replay.publishedUrl).toBeNull();
      expect(replay.publishNotes).toBeNull();
      expect(replay.packageHash).toBe(publicationPackage.packageHash);

      await expect(updatePublicationStatus(context.prisma, publicationPackage.id, {
        status: "ready",
      })).rejects.toThrow("transition");
      const archived = await updatePublicationStatus(context.prisma, publicationPackage.id, {
        status: "archived",
      });
      expect(archived.status).toBe("archived");
      expect(archived.publishedAt?.toISOString()).toBe(fixedNow.toISOString());
      await expect(updatePublicationStatus(context.prisma, publicationPackage.id, {
        status: "published",
        publishedAt: fixedNow,
      })).rejects.toThrow("transition");
    } finally {
      await disposePublicationTestContext(context);
    }
  });

  it("does not let lifecycle operations mutate the creation-time package hash", async () => {
    const context = await createPublicationTestContext("hash-lifecycle");
    try {
      const { package: publicationPackage } = await createPublicationPackage(
        context.prisma,
        context.approvedDraftId,
      );
      const checklist = JSON.parse(publicationPackage.publishChecklistJson) as {
        items: Array<{ id: string; kind: "automatic" | "manual" }>;
      };
      await updateManualChecklist(
        context.prisma,
        publicationPackage.id,
        checklist.items.filter(({ kind }) => kind === "manual").map(({ id }) => id),
      );
      await exportPublicationPackage(context.prisma, publicationPackage.id, "txt", { now: fixedNow });
      const after = await context.prisma.publicationPackage.findUniqueOrThrow({
        where: { id: publicationPackage.id },
      });

      expect(after.packageHash).toBe(publicationPackage.packageHash);
      expect(after.publishChecklistJson).not.toBe(publicationPackage.publishChecklistJson);
      expect(await context.prisma.publicationExport.count()).toBe(1);
    } finally {
      await disposePublicationTestContext(context);
    }
  });

  it("rolls back a failed published status update", async () => {
    const context = await createPublicationTestContext("status-rollback");
    try {
      const { package: publicationPackage } = await createPublicationPackage(
        context.prisma,
        context.approvedDraftId,
      );
      await exportPublicationPackage(context.prisma, publicationPackage.id, "txt", { now: fixedNow });
      const checklist = JSON.parse(publicationPackage.publishChecklistJson) as {
        items: Array<{ id: string; kind: "automatic" | "manual" }>;
      };
      await updateManualChecklist(
        context.prisma,
        publicationPackage.id,
        checklist.items.filter(({ kind }) => kind === "manual").map(({ id }) => id),
      );
      await context.prisma.$executeRawUnsafe(`
        CREATE TRIGGER fail_publication_status
        BEFORE UPDATE ON PublicationPackage
        WHEN NEW.status = 'published'
        BEGIN
          SELECT RAISE(ABORT, 'forced publication status failure');
        END;
      `);

      await expect(updatePublicationStatus(context.prisma, publicationPackage.id, {
        status: "published",
        publishedAt: fixedNow,
      })).rejects.toThrow();
      const after = await context.prisma.publicationPackage.findUniqueOrThrow({
        where: { id: publicationPackage.id },
      });
      expect(after.status).toBe("exported");
      expect(after.publishedAt).toBeNull();
      expect(after.publishedUrl).toBeNull();
      expect(after.publishNotes).toBeNull();
      expect(after.packageHash).toBe(publicationPackage.packageHash);
    } finally {
      await disposePublicationTestContext(context);
    }
  });
});
