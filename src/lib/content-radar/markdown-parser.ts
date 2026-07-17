import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import type { MaterialIndexItem, SourcePlatform } from "./types.ts";

type Frontmatter = Record<string, string | string[]>;

function parseScalar(value: string) {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1).split(",").map((entry) => entry.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  }
  return trimmed;
}

function splitFrontmatter(markdown: string): { frontmatter: Frontmatter; body: string } {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0] !== "---") return { frontmatter: {}, body: markdown.replace(/^\uFEFF/, "") };
  const closingIndex = lines.slice(1).findIndex((line) => line === "---");
  if (closingIndex < 0) return { frontmatter: {}, body: markdown.replace(/^\uFEFF/, "") };
  const frontmatter: Frontmatter = {};
  lines.slice(1, closingIndex + 1).forEach((line) => {
    const match = line.match(/^([\p{L}\p{N}_-]+):\s*(.*)$/u);
    if (match) frontmatter[match[1]] = parseScalar(match[2]);
  });
  return { frontmatter, body: lines.slice(closingIndex + 2).join("\n") };
}

function text(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.join(", ") : value?.trim() || "";
}

function tags(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value;
  return value ? value.split(",").map((entry) => entry.trim()).filter(Boolean) : [];
}

function cleanBody(body: string) {
  return body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<([a-z][a-z0-9-]*)\b[^>]*(?:hidden|display\s*:\s*none)[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/!\[\[[^\]]+\]\]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function platform(sourceUrl: string): SourcePlatform {
  if (!sourceUrl) return "unknown";
  try {
    const host = new URL(sourceUrl).hostname.toLowerCase();
    if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")) return "x";
    if (host === "feishu.cn" || host.endsWith(".feishu.cn")) return "feishu";
    if (host === "mp.weixin.qq.com" || host.endsWith(".weixin.qq.com")) return "wechat";
    return "web";
  } catch {
    return "unknown";
  }
}

function wordCount(value: string) {
  const han = value.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const words = value.replace(/[\u3400-\u9fff]/g, " ").match(/[\p{L}\p{N}_-]+/gu)?.length ?? 0;
  return han + words;
}

function identifiers(value: string) {
  return Array.from(new Set(value.match(/@?[A-Za-z][A-Za-z0-9_-]{2,}/g)?.map((entry) => entry.replace(/^@/, "").toLocaleLowerCase()) || [])).slice(0, 500);
}

export function parseMaterialMarkdown(markdown: string, relativePath: string, modifiedAt: string, excerptLimit = 800): MaterialIndexItem {
  const { frontmatter, body } = splitFrontmatter(markdown);
  const clean = cleanBody(body);
  const h1 = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const fallbackTitle = basename(relativePath, extname(relativePath));
  const sourceUrl = ["url", "source_url", "original_url", "link"].map((key) => text(frontmatter[key])).find(Boolean) || "";
  const savedAt = ["saved", "created_at", "date"].map((key) => text(frontmatter[key])).find(Boolean) || modifiedAt;
  const contentHash = createHash("sha256").update(markdown, "utf8").digest("hex");

  return {
    sourceId: `SRC-${contentHash.slice(0, 12)}`,
    relativePath,
    title: text(frontmatter.title) || h1 || fallbackTitle,
    author: ["author", "creator", "username"].map((key) => text(frontmatter[key])).find(Boolean) || "",
    sourceUrl: sourceUrl || null,
    sourcePlatform: platform(sourceUrl),
    savedAt: savedAt || null,
    modifiedAt,
    tags: tags(frontmatter.tags),
    excerpt: Array.from(clean).slice(0, excerptLimit).join(""),
    contentHash,
    wordCount: wordCount(clean),
    size: Buffer.byteLength(markdown, "utf8"),
    identifiers: identifiers(markdown),
  };
}
