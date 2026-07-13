import { describe, expect, it } from "vitest";
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
});
