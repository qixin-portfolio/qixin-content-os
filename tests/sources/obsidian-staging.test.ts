import Database from "better-sqlite3";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
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

    writeFileForTest(join(root, "one.md"), "---\nsource: https://example.com/one\n---\n\n第二版研究内容足够长，恢复后应清除缺失状态。");
    scan = scanObsidianVault(root, { vaultKey: "test-vault" });
    await importObsidianCandidates(prisma, project.id, source.id, scan);
    expect((await prisma.sourceItem.findFirstOrThrow()).sourceMissingAt).toBeNull();

    renameSync(join(root, "one.md"), join(root, "moved.md"));
    scan = scanObsidianVault(root, { vaultKey: "test-vault" });
    await importObsidianCandidates(prisma, project.id, source.id, scan);
    expect(await prisma.sourceItem.count({ where: { projectId: project.id } })).toBe(2);
    expect((await prisma.sourceItem.findUniqueOrThrow({ where: { projectSourceId_relativePath: { projectSourceId: source.id, relativePath: "one.md" } } })).sourceMissingAt).not.toBeNull();
    expect((await prisma.sourceItem.findUniqueOrThrow({ where: { projectSourceId_relativePath: { projectSourceId: source.id, relativePath: "moved.md" } } })).sourceMissingAt).toBeNull();
    rmSync(root, { recursive: true, force: true });
  });

  it("keeps identical content at different paths as independent SourceItems", async () => {
    const project = await prisma.project.create({ data: { name: "同内容不同路径", slug: `same-content-${process.pid}` } });
    const source = await prisma.projectSource.create({ data: { projectId: project.id, sourceType: "obsidian_vault", sourceName: "外部内容运营研究库", vaultKey: `same-content-${process.pid}`, enabled: true } });
    const root = join(tmpdir(), `qixin-obsidian-same-content-${process.pid}`);
    mkdirSyncForTest(root);
    const content = "---\nsource: https://example.com/same\n---\n\n相同正文仍按不同相对路径分别暂存。";
    writeFileForTest(join(root, "a.md"), content);
    writeFileForTest(join(root, "b.md"), content);
    await importObsidianCandidates(prisma, project.id, source.id, scanObsidianVault(root, { vaultKey: `same-content-${process.pid}` }));
    expect(await prisma.sourceItem.count({ where: { projectId: project.id } })).toBe(2);
    expect(await prisma.sourceItemVersion.count({ where: { sourceItem: { projectId: project.id } } })).toBe(2);
    rmSync(root, { recursive: true, force: true });
  });

  it("keeps SourceItem versions unique across concurrent imports", async () => {
    const project = await prisma.project.create({ data: { name: "并发导入", slug: `concurrent-${process.pid}` } });
    const source = await prisma.projectSource.create({ data: { projectId: project.id, sourceType: "obsidian_vault", sourceName: "外部内容运营研究库", vaultKey: `concurrent-${process.pid}`, enabled: true } });
    const root = join(tmpdir(), `qixin-obsidian-concurrent-${process.pid}`);
    mkdirSyncForTest(root);
    writeFileForTest(join(root, "one.md"), "---\nsource: https://example.com/concurrent\n---\n\n并发导入必须只产生一个版本。");
    const scan = scanObsidianVault(root, { vaultKey: `concurrent-${process.pid}` });
    const secondClient = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databasePath }) });
    try {
      await Promise.all([
        importObsidianCandidates(prisma, project.id, source.id, scan),
        importObsidianCandidates(secondClient, project.id, source.id, scan),
      ]);
    } finally {
      await secondClient.$disconnect();
    }
    expect(await prisma.sourceItem.count({ where: { projectId: project.id } })).toBe(1);
    expect(await prisma.sourceItemVersion.count({ where: { sourceItem: { projectId: project.id } } })).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  it("revalidates quarantine at the staging boundary", async () => {
    const project = await prisma.project.create({ data: { name: "隔离绕过", slug: `quarantine-${process.pid}` } });
    const source = await prisma.projectSource.create({ data: { projectId: project.id, sourceType: "obsidian_vault", sourceName: "外部内容运营研究库", vaultKey: `quarantine-${process.pid}`, enabled: true } });
    const root = join(tmpdir(), `qixin-obsidian-quarantine-${process.pid}`);
    mkdirSyncForTest(root);
    writeFileForTest(join(root, "risk.md"), "---\nsource: https://example.com/risk\n---\n\n电话：13812345678");
    const scan = scanObsidianVault(root, { vaultKey: `quarantine-${process.pid}` });
    scan.notes[0].isSourceItemCandidate = true;
    await importObsidianCandidates(prisma, project.id, source.id, scan);
    expect(await prisma.sourceItem.count({ where: { projectId: project.id } })).toBe(0);
    expect(await prisma.sourceItemVersion.count({ where: { sourceItem: { projectId: project.id } } })).toBe(0);

    writeFileForTest(join(root, "missing-source.md"), "# 没有来源\n\n调用方不能伪造来源状态。");
    const missingSourceScan = scanObsidianVault(root, { vaultKey: `quarantine-${process.pid}` });
    const missingSource = missingSourceScan.notes.find((note) => note.relativePath === "missing-source.md")!;
    missingSource.isSourceItemCandidate = true;
    missingSource.riskFlags = [];
    await importObsidianCandidates(prisma, project.id, source.id, missingSourceScan);
    expect(await prisma.sourceItem.count({ where: { projectId: project.id } })).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });

  it("marks an existing SourceItem unavailable when the source becomes risky", async () => {
    const project = await prisma.project.create({ data: { name: "风险升级", slug: `risk-upgrade-${process.pid}` } });
    const vaultKey = `risk-upgrade-${process.pid}`;
    const source = await prisma.projectSource.create({ data: { projectId: project.id, sourceType: "obsidian_vault", sourceName: "外部内容运营研究库", vaultKey, enabled: true } });
    const root = join(tmpdir(), `qixin-obsidian-risk-upgrade-${process.pid}`);
    mkdirSyncForTest(root);
    writeFileForTest(join(root, "note.md"), "---\nsource: https://example.com/note\n---\n\n安全研究摘要。");
    await importObsidianCandidates(prisma, project.id, source.id, scanObsidianVault(root, { vaultKey }));
    writeFileForTest(join(root, "note.md"), "---\nsource: https://example.com/note\n---\n\n电话：13812345678");
    await importObsidianCandidates(prisma, project.id, source.id, scanObsidianVault(root, { vaultKey }));
    const item = await prisma.sourceItem.findFirstOrThrow({ where: { projectId: project.id } });
    expect(item.sourceMissingAt).not.toBeNull();
    expect(JSON.parse(item.riskFlagsJson ?? "[]")).toContain("phone_number");
    expect(await prisma.sourceItemVersion.count({ where: { sourceItemId: item.id } })).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects a scan whose vaultKey does not match the target ProjectSource", async () => {
    const project = await prisma.project.create({ data: { name: "Vault 绑定", slug: `vault-binding-${process.pid}` } });
    const source = await prisma.projectSource.create({ data: { projectId: project.id, sourceType: "obsidian_vault", sourceName: "外部内容运营研究库", vaultKey: `expected-${process.pid}`, enabled: true } });
    const root = join(tmpdir(), `qixin-obsidian-vault-binding-${process.pid}`);
    mkdirSyncForTest(root);
    writeFileForTest(join(root, "note.md"), "---\nsource: https://example.com/note\n---\n\n不允许跨 Vault 暂存。");
    await expect(importObsidianCandidates(prisma, project.id, source.id, scanObsidianVault(root, { vaultKey: `other-${process.pid}` }))).rejects.toThrow("vaultKey");
    expect(await prisma.scanRun.count({ where: { projectSourceId: source.id } })).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });

  it("stores only the bounded safe summary, not the full external article", async () => {
    const project = await prisma.project.create({ data: { name: "摘要边界", slug: `summary-${process.pid}` } });
    const source = await prisma.projectSource.create({ data: { projectId: project.id, sourceType: "obsidian_vault", sourceName: "外部内容运营研究库", vaultKey: `summary-${process.pid}`, enabled: true } });
    const root = join(tmpdir(), `qixin-obsidian-summary-${process.pid}`);
    mkdirSyncForTest(root);
    const marker = "不应进入数据库的文章尾部标记";
    writeFileForTest(join(root, "long.md"), `---\nsource: https://example.com/long\n---\n\n${"外部文章正文".repeat(80)}${marker}`);
    await importObsidianCandidates(prisma, project.id, source.id, scanObsidianVault(root, { vaultKey: `summary-${process.pid}` }));
    const item = await prisma.sourceItem.findFirstOrThrow({ where: { projectId: project.id } });
    const version = await prisma.sourceItemVersion.findFirstOrThrow({ where: { sourceItemId: item.id } });
    expect(item.content).toBe(item.summary);
    expect(version.content).toBe(version.summary);
    expect(item.content).not.toContain(marker);
    expect(item.content.length).toBeLessThanOrEqual(181);
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

  it("rolls back TopicCandidate and links together on failure", async () => {
    const project = await prisma.project.create({ data: { name: "选题回滚", slug: `topic-rollback-${process.pid}` } });
    const source = await prisma.projectSource.create({ data: { projectId: project.id, sourceType: "obsidian_vault", sourceName: "外部内容运营研究库", vaultKey: `topic-rollback-${process.pid}`, sourceCategory: "external_research", enabled: true } });
    await prisma.sourceItem.create({ data: { projectId: project.id, projectSourceId: source.id, sourceType: "obsidian_vault", title: "来源", content: "安全摘要", summary: "安全摘要", relativePath: "source.md", sourcePath: "source.md", sourceCategory: "external_research", factEligibility: "unverified_reference", visibility: "private" } });
    await prisma.$executeRawUnsafe("CREATE TRIGGER phase6a_fail_topic_link BEFORE INSERT ON TopicCandidateSource BEGIN SELECT RAISE(ABORT, 'forced topic link failure'); END;");
    await expect(importTopicCandidates(prisma, project.id, [{ title: "事务选题", targetAudience: "运营", userPainPoint: "缺证据", coreAngle: "验证原子性", relatedSourceRelativePaths: ["source.md"], evidenceStrength: "weak", freshness: "中", suggestedPlatforms: ["x"], riskFlags: [], status: "proposed" }])).rejects.toThrow();
    await prisma.$executeRawUnsafe("DROP TRIGGER phase6a_fail_topic_link;");
    expect(await prisma.topicCandidate.count({ where: { projectId: project.id } })).toBe(0);
    expect(await prisma.topicCandidateSource.count({ where: { topicCandidate: { projectId: project.id } } })).toBe(0);
  });

  it("does not link a TopicCandidate to a non-Obsidian SourceItem with the same path", async () => {
    const project = await prisma.project.create({ data: { name: "来源边界", slug: `source-boundary-${process.pid}` } });
    await prisma.sourceItem.create({ data: { projectId: project.id, sourceType: "manual", title: "内部正文", content: "不应展示或关联的完整内部正文", relativePath: "same.md", sourcePath: "same.md", visibility: "private" } });
    await importTopicCandidates(prisma, project.id, [{ title: "只关联外部研究", targetAudience: "运营", userPainPoint: "来源混淆", coreAngle: "约束来源类型", relatedSourceRelativePaths: ["same.md"], evidenceStrength: "weak", freshness: "中", suggestedPlatforms: ["x"], riskFlags: [], status: "proposed" }]);
    expect(await prisma.topicCandidateSource.count({ where: { topicCandidate: { projectId: project.id } } })).toBe(0);
  });

  it("links TopicCandidates only to the explicitly selected Vault source", async () => {
    const project = await prisma.project.create({ data: { name: "多 Vault 来源", slug: `multi-vault-${process.pid}` } });
    const first = await prisma.projectSource.create({ data: { projectId: project.id, sourceType: "obsidian_vault", sourceName: "第一库", vaultKey: `multi-first-${process.pid}`, sourceCategory: "external_research", enabled: true } });
    const second = await prisma.projectSource.create({ data: { projectId: project.id, sourceType: "obsidian_vault", sourceName: "第二库", vaultKey: `multi-second-${process.pid}`, sourceCategory: "external_research", enabled: true } });
    for (const source of [first, second]) {
      await prisma.sourceItem.create({ data: { projectId: project.id, projectSourceId: source.id, sourceType: "obsidian_vault", title: source.sourceName, content: "安全摘要", summary: "安全摘要", relativePath: "same.md", sourcePath: "same.md", sourceCategory: "external_research", factEligibility: "unverified_reference", riskFlagsJson: "[]", visibility: "private" } });
    }
    await importTopicCandidates(prisma, project.id, [{ title: "明确来源", targetAudience: "运营", userPainPoint: "同名路径", coreAngle: "按 Vault 绑定", relatedSourceRelativePaths: ["same.md"], evidenceStrength: "weak", freshness: "中", suggestedPlatforms: ["x"], riskFlags: [], status: "proposed" }], second.id);
    const relation = await prisma.topicCandidateSource.findFirstOrThrow({ where: { topicCandidate: { projectId: project.id } }, include: { sourceItem: true } });
    expect(relation.sourceItem.projectSourceId).toBe(second.id);
  });

  it("removes stale manifest relations when a TopicCandidate source changes", async () => {
    const project = await prisma.project.create({ data: { name: "来源改绑", slug: `relation-rebind-${process.pid}` } });
    const source = await prisma.projectSource.create({ data: { projectId: project.id, sourceType: "obsidian_vault", sourceName: "研究库", vaultKey: `relation-rebind-${process.pid}`, sourceCategory: "external_research", enabled: true } });
    for (const relativePath of ["a.md", "b.md"]) {
      await prisma.sourceItem.create({ data: { projectId: project.id, projectSourceId: source.id, sourceType: "obsidian_vault", title: relativePath, content: "安全摘要", summary: "安全摘要", relativePath, sourcePath: relativePath, sourceCategory: "external_research", factEligibility: "unverified_reference", riskFlagsJson: "[]", visibility: "private" } });
    }
    const base = { title: "改绑来源", targetAudience: "运营", userPainPoint: "来源需纠正", coreAngle: "仅保留当前清单", evidenceStrength: "weak" as const, freshness: "中", suggestedPlatforms: ["x" as const], riskFlags: [], status: "proposed" as const };
    await importTopicCandidates(prisma, project.id, [{ ...base, relatedSourceRelativePaths: ["a.md"] }], source.id);
    await importTopicCandidates(prisma, project.id, [{ ...base, relatedSourceRelativePaths: ["b.md"] }], source.id);
    const relations = await prisma.topicCandidateSource.findMany({ where: { topicCandidate: { projectId: project.id } }, include: { sourceItem: true } });
    expect(relations.map((relation) => relation.sourceItem.relativePath)).toEqual(["b.md"]);
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
