import Database from "better-sqlite3";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  importVoiceSamples,
  formatImportSummary,
  parseVoiceSampleFile,
  planVoiceSampleImport,
} from "../../scripts/import-voice-samples";

const databasePath = join(tmpdir(), `qixin-content-os-voice-import-${process.pid}.db`);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databasePath }) });

describe("voice sample import", () => {
  beforeAll(async () => {
    const database = new Database(databasePath);
    database.exec(readFileSync("prisma/migrations/20260712110000_add_project_sources_and_traceability/migration.sql", "utf8"));
    database.exec(readFileSync("prisma/migrations/20260712120000_add_content_intelligence/migration.sql", "utf8"));
    database.exec(readFileSync("prisma/migrations/20260712130000_add_editorial_workbench/migration.sql", "utf8"));
    database.close();
    await prisma.voiceProfile.create({
      data: {
        id: "voice-import-test",
        name: "导入测试声音",
        platform: "wechat_moments",
        tone: "真实",
        preferredWordsJson: "[]",
        avoidWordsJson: "[]",
        writingRulesJson: "[]",
        exampleTextsJson: "[]",
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    rmSync(databasePath, { force: true });
  });

  it("parses CSV and JSON input", () => {
    expect(parseVoiceSampleFile(
      "platform,title,body,qualityRating\nwechat_moments,记录," +
      '"第一行,带逗号\n第二行",5\n',
      "samples.csv",
    )).toEqual([{ platform: "wechat_moments", title: "记录", body: "第一行,带逗号\n第二行", qualityRating: "5" }]);
    expect(parseVoiceSampleFile(
      JSON.stringify([{ platform: "x", title: "X 记录", body: "正文", qualityRating: 4 }]),
      "samples.json",
    )).toEqual([{ platform: "x", title: "X 记录", body: "正文", qualityRating: 4 }]);
  });

  it("rejects empty body, unsupported platforms, and invalid ratings", () => {
    const plan = planVoiceSampleImport([
      { platform: "wechat_moments", title: "", body: "", qualityRating: 6 },
      { platform: "blog", title: "标题", body: "正文", qualityRating: 3 },
    ], []);

    expect(plan.successCount).toBe(0);
    expect(plan.failures.map((failure) => failure.reason).join("；")).toContain("body is required");
    expect(plan.failures.map((failure) => failure.reason).join("；")).toContain("unsupported platform");
    expect(plan.failures.map((failure) => failure.reason).join("；")).toContain("qualityRating must be an integer between 1 and 5");
  });

  it("deduplicates by platform and body hash while allowing the same body on another platform", () => {
    const plan = planVoiceSampleImport([
      { platform: "wechat_moments", title: "第一条", body: "同一正文", qualityRating: "5" },
      { platform: "wechat_moments", title: "重复标题", body: "同一正文", qualityRating: "4" },
      { platform: "x", title: "X 版本", body: "同一正文", qualityRating: "4" },
    ], []);

    expect(plan.successCount).toBe(2);
    expect(plan.duplicateCount).toBe(1);
    expect(plan.rows[0].sourceType).toBe("imported_post");
    expect(plan.rows.map((row) => row.platform)).toEqual(["wechat_moments", "x"]);
  });

  it("prints the required dry-run summary fields and failure reasons", () => {
    const output = formatImportSummary({
      successCount: 1,
      skippedCount: 2,
      duplicateCount: 1,
      failures: [{ rowNumber: 4, reason: "body is required" }],
      rows: [],
    }, true);

    expect(output).toContain("dry-run（未写入数据库）");
    expect(output).toContain("成功数量：1");
    expect(output).toContain("跳过数量：2");
    expect(output).toContain("重复数量：1");
    expect(output).toContain("第 4 行：body is required");
  });

  it("supports dry-run and does not overwrite an existing VoiceSample", async () => {
    await prisma.voiceSample.create({
      data: {
        voiceProfileId: "voice-import-test",
        platform: "wechat_moments",
        title: "已有样本",
        body: "已有正文",
        sourceType: "manual_input",
        sourceReferenceId: "manual:test",
        qualityRating: 5,
        notes: "保留",
        approved: true,
      },
    });
    const rows = [
      { platform: "wechat_moments", title: "不覆盖", body: "已有正文", qualityRating: 1 },
      { platform: "wechat_moments", title: "新样本", body: "新的正文", qualityRating: 4 },
    ];

    const dryRun = await importVoiceSamples(prisma, rows, { dryRun: true });
    expect(dryRun.successCount).toBe(1);
    expect(dryRun.duplicateCount).toBe(1);
    expect(await prisma.voiceSample.count()).toBe(1);

    const imported = await importVoiceSamples(prisma, rows);
    expect(imported.successCount).toBe(1);
    expect(await prisma.voiceSample.count()).toBe(2);
    expect(await prisma.voiceSample.findFirstOrThrow({ where: { body: "已有正文" } })).toMatchObject({ title: "已有样本", qualityRating: 5 });
  });
});
