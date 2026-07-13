import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { exportPublicationPackage } from "../../src/lib/publication/export-service";
import { createPublicationPackage } from "../../src/lib/publication/package-service";
import {
  createPublicationTestContext,
  disposePublicationTestContext,
} from "./fixtures";

const exportNow = new Date("2026-07-13T09:00:00.000Z");

describe("publication export service", () => {
  it("exports TXT as final copy only", async () => {
    const context = await createPublicationTestContext("export-txt");
    try {
      const { package: publicationPackage } = await createPublicationPackage(
        context.prisma,
        context.approvedDraftId,
      );
      const result = await exportPublicationPackage(
        context.prisma,
        publicationPackage.id,
        "txt",
        { now: exportNow },
      );

      expect(result.content).toBe(publicationPackage.body);
      expect(result.content).not.toContain("SourceItem");
      expect(result.content).not.toContain("发布检查单");
      expect(result.content).not.toMatch(/^#{1,6}\s/m);
      expect(Buffer.from(result.content, "utf8").toString("utf8")).toBe(publicationPackage.body);
      expect(result.contentHash).toBe(createHash("sha256")
        .update(Buffer.from(result.content, "utf8"))
        .digest("hex"));
      expect(result.fileName).toBe("2026-07-13-wechat-moments-transparent-construction.txt");
    } finally {
      await disposePublicationTestContext(context);
    }
  });

  it("exports Markdown with evidence, boundaries, assets and checklist", async () => {
    const context = await createPublicationTestContext("export-markdown");
    try {
      const { package: publicationPackage } = await createPublicationPackage(
        context.prisma,
        context.approvedDraftId,
      );
      const result = await exportPublicationPackage(
        context.prisma,
        publicationPackage.id,
        "markdown",
        { now: exportNow },
      );

      expect(result.content).toContain("# 透明工地资料整理（测试批准版）");
      expect(result.content).toContain("## 最终文案");
      expect(result.content).toContain("## 配图需求");
      expect(result.content).toContain("## 事实边界");
      expect(result.content).toContain("## 发布检查单");
      expect(result.content).toContain("## 证据来源摘要");
    } finally {
      await disposePublicationTestContext(context);
    }
  });

  it("exports parseable JSON without private absolute paths", async () => {
    const context = await createPublicationTestContext("export-json");
    try {
      const { package: publicationPackage } = await createPublicationPackage(
        context.prisma,
        context.approvedDraftId,
      );
      const result = await exportPublicationPackage(
        context.prisma,
        publicationPackage.id,
        "json",
        { now: exportNow },
      );
      const parsed = JSON.parse(result.content) as {
        package: { id: string; body: string };
        evidenceSnapshot: { sourceItems: unknown[] };
      };

      expect(parsed.package.id).toBe(publicationPackage.id);
      expect(parsed.package.body).toBe(publicationPackage.body);
      expect(parsed.evidenceSnapshot.sourceItems).toHaveLength(4);
      expect(Object.keys(parsed).sort()).toEqual([
        "assetBrief",
        "evidenceSnapshot",
        "factBoundary",
        "package",
        "publishChecklist",
      ]);
      expect(result.content).not.toContain("/Users/private");
      expect(result.content).not.toContain("DATABASE_URL");
    } finally {
      await disposePublicationTestContext(context);
    }
  });

  it("creates a new export record for every export with stable content hashes", async () => {
    const context = await createPublicationTestContext("export-records");
    try {
      const { package: publicationPackage } = await createPublicationPackage(
        context.prisma,
        context.approvedDraftId,
      );
      const first = await exportPublicationPackage(
        context.prisma,
        publicationPackage.id,
        "txt",
        { now: exportNow },
      );
      const second = await exportPublicationPackage(
        context.prisma,
        publicationPackage.id,
        "txt",
        { now: exportNow },
      );
      const stored = await context.prisma.publicationPackage.findUniqueOrThrow({
        where: { id: publicationPackage.id },
      });

      expect(first.record.id).not.toBe(second.record.id);
      expect(first.contentHash).toBe(second.contentHash);
      expect(await context.prisma.publicationExport.count()).toBe(2);
      expect(stored.status).toBe("exported");
    } finally {
      await disposePublicationTestContext(context);
    }
  });

  it("sanitizes project slugs before building download file names", async () => {
    const context = await createPublicationTestContext("safe-file-name");
    try {
      const { package: publicationPackage } = await createPublicationPackage(
        context.prisma,
        context.approvedDraftId,
      );
      await context.prisma.project.update({
        where: { id: context.project.id },
        data: { slug: "../../透明工地\\bad:name" },
      });
      const result = await exportPublicationPackage(
        context.prisma,
        publicationPackage.id,
        "txt",
        { now: exportNow },
      );

      expect(result.fileName).not.toContain("..");
      expect(result.fileName).not.toContain("/");
      expect(result.fileName).not.toContain("\\");
      expect(result.fileName).not.toContain(":");
      expect(result.fileName).toBe("2026-07-13-wechat-moments-bad-name.txt");
    } finally {
      await disposePublicationTestContext(context);
    }
  });

  it("rolls back exported status when content generation fails", async () => {
    const context = await createPublicationTestContext("export-render-failure");
    try {
      const { package: publicationPackage } = await createPublicationPackage(
        context.prisma,
        context.approvedDraftId,
      );
      await context.prisma.publicationPackage.update({
        where: { id: publicationPackage.id },
        data: { assetBriefJson: "{invalid-json" },
      });

      await expect(exportPublicationPackage(
        context.prisma,
        publicationPackage.id,
        "markdown",
        { now: exportNow },
      )).rejects.toThrow();
      const after = await context.prisma.publicationPackage.findUniqueOrThrow({
        where: { id: publicationPackage.id },
      });
      expect(after.status).toBe("ready");
      expect(await context.prisma.publicationExport.count()).toBe(0);
    } finally {
      await disposePublicationTestContext(context);
    }
  });

  it("rolls back exported status when the export record insert fails", async () => {
    const context = await createPublicationTestContext("export-record-failure");
    try {
      const { package: publicationPackage } = await createPublicationPackage(
        context.prisma,
        context.approvedDraftId,
      );
      await context.prisma.$executeRawUnsafe(`
        CREATE TRIGGER fail_publication_export
        BEFORE INSERT ON PublicationExport
        BEGIN
          SELECT RAISE(ABORT, 'forced PublicationExport failure');
        END;
      `);

      await expect(exportPublicationPackage(
        context.prisma,
        publicationPackage.id,
        "txt",
        { now: exportNow },
      )).rejects.toThrow();
      const after = await context.prisma.publicationPackage.findUniqueOrThrow({
        where: { id: publicationPackage.id },
      });
      expect(after.status).toBe("ready");
      expect(await context.prisma.publicationExport.count()).toBe(0);
    } finally {
      await disposePublicationTestContext(context);
    }
  });
});
