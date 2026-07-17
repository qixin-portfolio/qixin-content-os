import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import { parseMaterialMarkdown } from "./markdown-parser.ts";
import { resolveAllowedRoot } from "./path-guard.ts";
import type { MaterialIndex, MaterialIndexItem, RadarConfig, ScanResult } from "./types.ts";

function ignored(relativePath: string, patterns: string[]) {
  const normalized = relativePath.replaceAll("\\", "/");
  return patterns.some((pattern) => {
    if (pattern === "**/.DS_Store") return normalized.endsWith("/.DS_Store") || normalized === ".DS_Store";
    if (pattern === "**/*.canvas") return normalized.endsWith(".canvas");
    const directory = pattern.replace(/^\*\*\//, "").replace(/\/\*\*$/, "").replace(/\/$/, "");
    return normalized === directory || normalized.includes(`/${directory}/`);
  });
}

function oversizedItem(relativePath: string, raw: Buffer, modifiedAt: string): MaterialIndexItem {
  const contentHash = createHash("sha256").update(raw).digest("hex");
  return {
    sourceId: `SRC-${contentHash.slice(0, 12)}`,
    relativePath,
    title: relativePath.split("/").at(-1)?.replace(/\.md$/i, "") || "未命名素材",
    author: "",
    sourceUrl: null,
    sourcePlatform: "unknown",
    savedAt: modifiedAt,
    modifiedAt,
    tags: [],
    excerpt: "",
    contentHash,
    wordCount: 0,
    size: raw.length,
    identifiers: [],
    oversized: true,
  };
}

function sourceFiles(config: RadarConfig) {
  const files: Array<{ absolutePath: string; relativePath: string }> = [];
  for (const allowedRoot of config.allowedRoots) {
    const root = resolveAllowedRoot(config, allowedRoot);
    const visit = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === ".DS_Store") continue;
        const absolutePath = `${directory}/${entry.name}`;
        const stat = lstatSync(absolutePath);
        if (stat.isSymbolicLink()) continue;
        const relativePath = relative(config.vaultPath, absolutePath).replaceAll("\\", "/");
        if (ignored(relativePath, config.ignoredPatterns)) continue;
        if (stat.isDirectory()) visit(absolutePath);
        else if (stat.isFile() && /\.(?:md|markdown)$/i.test(entry.name)) files.push({ absolutePath, relativePath });
      }
    };
    visit(root);
  }
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export function scanMaterials(config: RadarConfig, previousIndex: MaterialIndex): ScanResult {
  const priorByPath = new Map(previousIndex.items.map((item) => [item.relativePath, item]));
  const nextItems: MaterialIndexItem[] = [];
  const errors: string[] = [];
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  const files = sourceFiles(config);

  for (const file of files) {
    try {
      if (!existsSync(file.absolutePath)) continue;
      const stat = lstatSync(file.absolutePath);
      const raw = readFileSync(file.absolutePath);
      const contentHash = createHash("sha256").update(raw).digest("hex");
      const modifiedAt = stat.mtime.toISOString();
      const prior = priorByPath.get(file.relativePath);
      if (previousIndex.parserVersion === 2 && prior && prior.modifiedAt === modifiedAt && prior.size === stat.size && prior.contentHash === contentHash) {
        unchanged += 1;
        nextItems.push(prior);
        continue;
      }
      const entry = stat.size > config.maxFileSizeBytes
        ? oversizedItem(file.relativePath, raw, modifiedAt)
        : parseMaterialMarkdown(raw.toString("utf8"), file.relativePath, modifiedAt);
      entry.size = stat.size;
      nextItems.push(entry);
      if (prior) updated += 1;
      else added += 1;
    } catch (error) {
      errors.push(`${file.relativePath}: ${error instanceof Error ? error.message : "unknown scan error"}`);
    }
  }

  return {
    index: { version: 1, parserVersion: 2, items: nextItems },
    summary: {
      status: "ok",
      scanned: nextItems.length,
      added,
      updated,
      unchanged,
      removed: previousIndex.items.filter((item) => !nextItems.some((next) => next.relativePath === item.relativePath)).length,
      errors,
    },
  };
}
