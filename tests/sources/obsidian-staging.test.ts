import Database from "better-sqlite3";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importObsidianCandidates, importTopicCandidates } from "../../src/lib/sources/obsidian/staging";
import { scanObsidianVault } from "../../src/lib/sources/obsidian/scanner";

const databasePath = join(tmpdir(), `qixin-obsidian-staging-${process.pid}.db`);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databasePath }) });

describe("Obsidian staging semantics", () => {
  beforeAll(async () => {
    const database = new Database(databasePath);
    const migrations = [
      "20260712110000_add_project_sources_and_traceability",
      "20260712120000_add_content_intelligence",
      "20260712130000_add_editorial_workbench",
      "20260713152000_add_approval_idempotency",
      "20260713170000_add_publication_packages",
      "20260714090000_add_phase6a_obsidian_research",
    ];
    for (const migration of migrations) {
      database.exec(readFileSync(`prisma/migrations/${migration}/migration.sql`, "utf8"));
    }
    database.close();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    rmSync(databasePath, { force: true });
  });

  it("is idempotent, preserves changed versions, and does not create events or voices", async () => {
    const project = await prisma.project.create({ data: { name: "临时研究项目", slug: `obsidian-${process.pid}` } });
    const source = await prisma.projectSource.create({
      data: {
        projectId: project.id,
        sourceType: "obsidian_vault",
        sourceName: "外部内容运营研究库",
        displayName: "外部内容运营研究库",
        vaultKey: "test-vault",
        sourceCategory: "external_research",
        rootFingerprint: "fingerprint",
        enabled: true,
      },
    });
    const root = join(tmpdir(), `qixin-obsidian-staging-vault-${process.pid}`);
    mkdirSyncForTest(root);
    writeFileForTest(join(root, "one.md"), "---\nsource: https://example.com/one\n---\n\n第一版研究内容足够长，可以作为外部资料摘要。");
    let scan = scanObsidianVault(root, { vaultKey: "test-vault" });
    await importObsidianCandidates(prisma, project.id, source.id, scan);
    await importObsidianCandidates(prisma, project.id, source.id, scan);
    expect(await prisma.sourceItem.count()).toBe(1);
    expect(await prisma.sourceItemVersion.count()).toBe(1);

    writeFileForTest(join(root, "one.md"), "---\nsource: https://example.com/one\n---\n\n第二版研究内容足够长，修改后必须保留第一版历史快照。");
    scan = scanObsidianVault(root, { vaultKey: "test-vault" });
    await importObsidianCandidates(prisma, project.id, source.id, scan);
    expect(await prisma.sourceItem.count()).toBe(1);
    expect(await prisma.sourceItemVersion.count()).toBe(2);
    expect(await prisma.eventCard.count()).toBe(0);
    expect(await prisma.voiceSample.count()).toBe(0);

    rmSync(join(root, "one.md"));
    scan = scanObsidianVault(root, { vaultKey: "test-vault" });
    await importObsidianCandidates(prisma, project.id, source.id, scan);
    expect(await prisma.sourceItem.count()).toBe(1);
    expect((await prisma.sourceItem.findFirstOrThrow()).sourceMissingAt).not.toBeNull();
    rmSync(root, { recursive: true, force: true });
  });

  it("imports topic candidates idempotently and links only existing source items", async () => {
    const project = await prisma.project.create({ data: { name: "选题项目", slug: `topics-${process.pid}` } });
    const result = await importTopicCandidates(prisma, project.id, [{
      title: "资料如何变成选题",
      targetAudience: "内容运营",
      userPainPoint: "收藏很多但写不出来",
      coreAngle: "先做来源和问题标注，再进入人工评审",
      relatedSourceRelativePaths: ["missing.md"],
      evidenceStrength: "medium",
      freshness: "高",
      suggestedPlatforms: ["xiaohongshu"],
      riskFlags: ["copyright_risk"],
      status: "proposed",
    }]);
    await importTopicCandidates(prisma, project.id, [{
      title: "资料如何变成选题",
      targetAudience: "内容运营",
      userPainPoint: "收藏很多但写不出来",
      coreAngle: "先做来源和问题标注，再进入人工评审",
      relatedSourceRelativePaths: ["missing.md"],
      evidenceStrength: "medium",
      freshness: "高",
      suggestedPlatforms: ["xiaohongshu"],
      riskFlags: ["copyright_risk"],
      status: "proposed",
    }]);
    expect(result.created).toBe(1);
    expect(await prisma.topicCandidate.count({ where: { projectId: project.id } })).toBe(1);
    expect(await prisma.topicCandidateSource.count({ where: { topicCandidate: { projectId: project.id } } })).toBe(0);
  });

  it("rolls back a failed staging transaction", async () => {
    const project = await prisma.project.create({ data: { name: "回滚项目", slug: `rollback-${process.pid}` } });
    const source = await prisma.projectSource.create({
      data: { projectId: project.id, sourceType: "obsidian_vault", sourceName: "外部内容运营研究库", vaultKey: `rollback-vault-${process.pid}`, enabled: true },
    });
    const root = join(tmpdir(), `qixin-obsidian-rollback-${process.pid}`);
    mkdirSyncForTest(root);
    writeFileForTest(join(root, "rollback.md"), "---\nsource: https://example.com/rollback\n---\n\n回滚测试内容足够长，故障时扫描记录和 SourceItem 必须一起回滚。");
    const scan = scanObsidianVault(root, { vaultKey: `rollback-vault-${process.pid}` });
    await prisma.$executeRawUnsafe("CREATE TRIGGER phase6a_fail_version BEFORE INSERT ON SourceItemVersion BEGIN SELECT RAISE(ABORT, 'forced phase6a failure'); END;");
    await expect(importObsidianCandidates(prisma, project.id, source.id, scan)).rejects.toThrow();
    await prisma.$executeRawUnsafe("DROP TRIGGER phase6a_fail_version;");
    expect(await prisma.scanRun.count({ where: { projectSourceId: source.id } })).toBe(0);
    expect(await prisma.sourceItem.count({ where: { projectId: project.id } })).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });
});

function mkdirSyncForTest(path: string) {
  mkdirSync(path, { recursive: true });
}

function writeFileForTest(path: string, content: string) {
  writeFileSync(path, content);
}
