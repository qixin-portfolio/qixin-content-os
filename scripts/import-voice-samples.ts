import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "../src/lib/prisma.ts";

export const supportedPlatforms = ["wechat_moments", "x", "xiaohongshu", "douyin"] as const;
export const supportedSourceTypes = ["manual_input", "approved_draft", "imported_post"] as const;

type Platform = typeof supportedPlatforms[number];
type SourceType = typeof supportedSourceTypes[number];
export type ImportRow = Record<string, unknown>;

export type PreparedVoiceSample = {
  platform: Platform;
  title: string;
  body: string;
  sourceType: SourceType;
  sourceReferenceId: string;
  qualityRating: number;
  notes: string;
};

export type ImportFailure = { rowNumber: number; reason: string };

export type ImportSummary = {
  successCount: number;
  skippedCount: number;
  duplicateCount: number;
  failures: ImportFailure[];
  rows: PreparedVoiceSample[];
};

function bodyHash(body: string) {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

function duplicateKey(platform: string, body: string) {
  return `${platform}:${bodyHash(body)}`;
}

function asText(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function parseCsv(content: string): ImportRow[] {
  const input = content.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];
    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  if (value || row.length > 0) {
    row.push(value);
    if (row.some((cell) => cell.trim())) rows.push(row);
  }
  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => !header)) throw new Error("CSV header cannot be empty");
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

export function parseVoiceSampleFile(content: string, fileName: string): ImportRow[] {
  if (fileName.toLowerCase().endsWith(".csv")) return parseCsv(content);
  if (fileName.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(content) as unknown;
    const rows = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray((parsed as { samples?: unknown }).samples)
      ? (parsed as { samples: unknown[] }).samples
      : null;
    if (!rows || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
      throw new Error("JSON must be an array of sample objects or an object with a samples array");
    }
    return rows as ImportRow[];
  }
  throw new Error("Input file must use .csv or .json extension");
}

function validateRow(row: ImportRow, rowNumber: number): { value?: PreparedVoiceSample; failure?: ImportFailure } {
  const platform = asText(row.platform).trim();
  const title = asText(row.title).trim();
  const body = asText(row.body).trim();
  const sourceTypeValue = asText(row.sourceType).trim() || "imported_post";
  const qualityValue = asText(row.qualityRating).trim();
  const qualityRating = Number(qualityValue);
  const originalPublishedAt = asText(row.originalPublishedAt).trim();
  const sourceImageName = asText(row.sourceImageName).trim();
  const errors: string[] = [];

  if (!supportedPlatforms.includes(platform as Platform)) errors.push("unsupported platform");
  if (!title) errors.push("title is required");
  if (!body) errors.push("body is required");
  if (!Number.isInteger(qualityRating) || qualityRating < 1 || qualityRating > 5) {
    errors.push("qualityRating must be an integer between 1 and 5");
  }
  if (!supportedSourceTypes.includes(sourceTypeValue as SourceType)) errors.push("unsupported sourceType");
  if (originalPublishedAt && Number.isNaN(Date.parse(originalPublishedAt))) errors.push("originalPublishedAt must be a valid date");
  if (errors.length > 0) return { failure: { rowNumber, reason: errors.join("; ") } };

  const hash = bodyHash(body);
  const notes = [
    asText(row.notes).trim(),
    originalPublishedAt ? `originalPublishedAt: ${originalPublishedAt}` : "",
  ].filter(Boolean).join("\n");
  return {
    value: {
      platform: platform as Platform,
      title,
      body,
      sourceType: sourceTypeValue as SourceType,
      sourceReferenceId: sourceImageName || `imported:${platform}:${hash}`,
      qualityRating,
      notes,
    },
  };
}

export function planVoiceSampleImport(
  inputRows: ImportRow[],
  existingSamples: Array<{ platform: string; body: string }>,
): ImportSummary {
  const seen = new Set(existingSamples.map((sample) => duplicateKey(sample.platform, sample.body.trim())));
  const rows: PreparedVoiceSample[] = [];
  const failures: ImportFailure[] = [];
  let duplicateCount = 0;

  inputRows.forEach((row, index) => {
    const validated = validateRow(row, index + 2);
    if (!validated.value) {
      failures.push(validated.failure as ImportFailure);
      return;
    }
    const key = duplicateKey(validated.value.platform, validated.value.body);
    if (seen.has(key)) {
      duplicateCount += 1;
      return;
    }
    seen.add(key);
    rows.push(validated.value);
  });

  return {
    successCount: rows.length,
    skippedCount: duplicateCount + failures.length,
    duplicateCount,
    failures,
    rows,
  };
}

export async function importVoiceSamples(
  prisma: PrismaClient,
  inputRows: ImportRow[],
  options: { dryRun?: boolean } = {},
): Promise<ImportSummary> {
  const [profiles, existingSamples] = await Promise.all([
    prisma.voiceProfile.findMany({ where: { platform: { in: [...supportedPlatforms] } }, select: { id: true, platform: true } }),
    prisma.voiceSample.findMany({ select: { platform: true, body: true } }),
  ]);
  const profileByPlatform = new Map(profiles.map((profile) => [profile.platform, profile.id]));
  const plan = planVoiceSampleImport(inputRows, existingSamples);
  const failures = [...plan.failures];
  const writableRows: Array<{ row: PreparedVoiceSample; voiceProfileId: string }> = [];
  plan.rows.forEach((row, index) => {
    const voiceProfileId = profileByPlatform.get(row.platform);
    if (!voiceProfileId) {
      failures.push({ rowNumber: index + 2, reason: `VoiceProfile not found for platform: ${row.platform}` });
      return;
    }
    writableRows.push({ row, voiceProfileId });
  });

  if (!options.dryRun && writableRows.length > 0) {
    await prisma.$transaction(writableRows.map(({ row, voiceProfileId }) => prisma.voiceSample.create({
      data: {
        voiceProfileId,
        platform: row.platform,
        title: row.title,
        body: row.body,
        sourceType: row.sourceType,
        sourceReferenceId: row.sourceReferenceId,
        qualityRating: row.qualityRating,
        notes: row.notes,
        approved: true,
        active: true,
      },
    })));
  }

  return {
    successCount: writableRows.length,
    skippedCount: inputRows.length - writableRows.length,
    duplicateCount: plan.duplicateCount,
    failures,
    rows: writableRows.map(({ row }) => row),
  };
}

export function formatImportSummary(summary: ImportSummary, dryRun: boolean) {
  const lines = [
    `模式：${dryRun ? "dry-run（未写入数据库）" : "实际导入"}`,
    `成功数量：${summary.successCount}`,
    `跳过数量：${summary.skippedCount}`,
    `重复数量：${summary.duplicateCount}`,
  ];
  if (summary.failures.length > 0) {
    lines.push("失败原因：");
    for (const failure of summary.failures) lines.push(`- 第 ${failure.rowNumber} 行：${failure.reason}`);
  } else {
    lines.push("失败原因：无");
  }
  return lines.join("\n");
}

function printSummary(summary: ImportSummary, dryRun: boolean) {
  console.log(formatImportSummary(summary, dryRun));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const filePath = args.find((arg) => !arg.startsWith("--"));
  if (!filePath) throw new Error("Usage: npm run voice-samples:import -- [--dry-run] <file.csv|file.json>");

  const rows = parseVoiceSampleFile(readFileSync(filePath, "utf8"), filePath);
  const prisma = getPrisma();
  try {
    const summary = await importVoiceSamples(prisma, rows, { dryRun });
    printSummary(summary, dryRun);
    if (summary.failures.length > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("import-voice-samples.ts")) {
  main().catch((error) => {
    console.error(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
