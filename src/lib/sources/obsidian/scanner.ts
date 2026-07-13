import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { frontmatterBoolean, frontmatterString, frontmatterStrings, parseFrontmatter } from "./frontmatter.ts";
import { parseObsidianLinks } from "./link-parser.ts";
import { manifestHash } from "./manifest.ts";
import { detectRiskFlags, isQuarantined, redactSensitiveText } from "./risk-detector.ts";
import {
  OBSIDIAN_DISPLAY_NAME,
  OBSIDIAN_FACT_ELIGIBILITY,
  OBSIDIAN_SOURCE_CATEGORY,
  type ObsidianNoteScan,
  type ObsidianScanResult,
} from "./types.ts";

export function scanObsidianVault(vaultPath: string, options: { vaultKey?: string; now?: Date } = {}): ObsidianScanResult {
  const root = resolve(vaultPath);
  const allFiles = collectFiles(root);
  const markdownFiles = allFiles.filter((file) => extname(file.relativePath).toLowerCase() === ".md");
  const seenHashes = new Set<string>();
  const notes: ObsidianNoteScan[] = [];

  for (const file of markdownFiles) {
    const markdown = readFileSync(file.absolutePath, "utf8");
    const parsed = parseFrontmatter(markdown);
    const body = parsed.body;
    const links = normalizeLinks(parseObsidianLinks(body), basename(root));
    const contentHash = hashContent(parsed.attributes, body);
    const title = frontmatterString(parsed.attributes, "title") ?? body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? basename(file.relativePath, ".md");
    const riskFlags = detectRiskFlags({
      relativePath: file.relativePath,
      body,
      attributes: parsed.attributes,
      attachmentRefs: links.attachmentRefs,
    });
    const valid = Boolean(body.trim()) && !body.includes("\u0000") && Boolean(title.trim());
    const duplicate = seenHashes.has(contentHash);
    if (valid) seenHashes.add(contentHash);
    const sourceUrl = getSourceUrl(parsed.attributes) ?? links.externalLinks[0];
    const hasSource = Boolean(sourceUrl) || frontmatterBoolean(parsed.attributes, "originalResearch");
    const quarantined = isQuarantined(riskFlags);
    notes.push({
      title,
      relativePath: file.relativePath,
      sourceUrl,
      author: frontmatterString(parsed.attributes, "author"),
      publishedAt: frontmatterString(parsed.attributes, "originalPublishedAt", "publishedAt", "date"),
      modifiedAt: file.modifiedAt,
      tags: frontmatterStrings(parsed.attributes, "tags", "tag"),
      contentHash,
      summary: summarizeMarkdown(body),
      riskFlags: hasSource ? riskFlags : [...new Set([...riskFlags, "unknown_source" as const])],
      sourceCategory: OBSIDIAN_SOURCE_CATEGORY,
      factEligibility: OBSIDIAN_FACT_ELIGIBILITY,
      links,
      isValid: valid,
      isDuplicate: duplicate,
      isQuarantined: quarantined,
      isSourceItemCandidate: valid && hasSource && !duplicate && !quarantined,
    });
  }

  const fileSet = new Set(allFiles.map((file) => file.relativePath));
  const brokenLinks = notes.reduce((count, note) => count + countBrokenWikiLinks(note, fileSet), 0);
  const missingAttachments = notes.reduce(
    (count, note) => count + note.links.attachmentRefs.filter((ref) => !resolveReferencedPath(note.relativePath, ref, fileSet)).length,
    0,
  );
  const fileManifest = allFiles.map((file) => [file.relativePath, file.size, file.modifiedAt]);
  const validCount = notes.filter((note) => note.isSourceItemCandidate).length;

  return {
    vaultKey: options.vaultKey ?? "obsidian-research-vault",
    displayName: OBSIDIAN_DISPLAY_NAME,
    rootFingerprint: manifestHash(allFiles.map((file) => file.relativePath)),
    lastScannedAt: (options.now ?? new Date()).toISOString(),
    discoveredCount: allFiles.length,
    markdownCount: markdownFiles.length,
    validCount,
    skippedCount: notes.length - validCount,
    duplicateCount: notes.filter((note) => note.isDuplicate).length,
    riskCount: notes.filter((note) => note.riskFlags.length > 0).length,
    quarantinedCount: notes.filter((note) => note.isQuarantined).length,
    sourceItemCandidates: notes.filter((note) => note.isSourceItemCandidate).length,
    missingSource: notes.filter((note) => note.isValid && !note.sourceUrl && note.riskFlags.includes("unknown_source")).length,
    brokenLinks,
    missingAttachments,
    manifestHash: manifestHash(fileManifest),
    notes,
  };
}

function collectFiles(root: string): Array<{ relativePath: string; absolutePath: string; size: number; modifiedAt: string }> {
  const result: Array<{ relativePath: string; absolutePath: string; size: number; modifiedAt: string }> = [];
  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      const relativePath = relative(root, absolutePath).split(sep).join("/");
      if (shouldIgnore(relativePath)) continue;
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) {
        const stat = statSync(absolutePath);
        result.push({ relativePath, absolutePath, size: stat.size, modifiedAt: stat.mtime.toISOString() });
      }
    }
  }
  visit(root);
  return result.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function shouldIgnore(relativePath: string): boolean {
  return relativePath.split("/").some((part) => part.startsWith(".") || part.startsWith("~") || part.endsWith(".tmp") || /冲突副本|conflict/i.test(part));
}

function hashContent(attributes: Record<string, unknown>, body: string): string {
  const stableFrontmatter = Object.keys(attributes).sort().map((key) => `${key}:${JSON.stringify(attributes[key])}`).join("\n");
  const normalizedBody = body.replace(/\r\n/g, "\n").trim().replace(/[ \t]+/g, " ");
  return createHash("sha256").update(`${stableFrontmatter}\n---\n${normalizedBody}`).digest("hex");
}

function getSourceUrl(attributes: Record<string, unknown>): string | undefined {
  for (const key of ["sourceUrl", "url", "source"]) {
    const value = attributes[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) return value.trim();
  }
  return undefined;
}

function summarizeMarkdown(body: string): string {
  const safe = redactSensitiveText(body)
    .replace(/!?(?:\[\[[^\]]+\]\]|\[[^\]]*\]\([^)]*\))/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[`*_>#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!safe) return "无可展示摘要";
  return `${safe.slice(0, 180)}${safe.length > 180 ? "…" : ""}`;
}

function countBrokenWikiLinks(note: ObsidianNoteScan, fileSet: Set<string>): number {
  return note.links.wikiLinks.filter((link) => !resolveReferencedPath(note.relativePath, link.target, fileSet)).length;
}

function resolveReferencedPath(notePath: string, target: string, fileSet: Set<string>): string | undefined {
  const normalized = target.replace(/^\.\//, "").replace(/\\/g, "/");
  const noteDirectory = notePath.includes("/") ? notePath.slice(0, notePath.lastIndexOf("/")) : "";
  const candidates = [normalized, `${normalized}.md`, noteDirectory ? `${noteDirectory}/${normalized}` : normalized, noteDirectory ? `${noteDirectory}/${normalized}.md` : `${normalized}.md`];
  return candidates.find((candidate) => fileSet.has(candidate));
}

function normalizeLinks(links: ReturnType<typeof parseObsidianLinks>, vaultFolderName: string) {
  const stripVaultPrefix = (value: string) => value.startsWith(`${vaultFolderName}/`) ? value.slice(vaultFolderName.length + 1) : value;
  return {
    wikiLinks: links.wikiLinks.map((link) => ({ ...link, target: stripVaultPrefix(link.target) })),
    externalLinks: links.externalLinks,
    attachmentRefs: links.attachmentRefs.map(stripVaultPrefix),
  };
}
