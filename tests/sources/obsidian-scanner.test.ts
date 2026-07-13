import { lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseFrontmatter } from "../../src/lib/sources/obsidian/frontmatter";
import { parseObsidianLinks } from "../../src/lib/sources/obsidian/link-parser";
import { scanObsidianVault } from "../../src/lib/sources/obsidian/scanner";

const roots: string[] = [];

function makeVault(files: Record<string, string>) {
  const root = join(tmpdir(), `qixin-obsidian-test-${process.pid}-${roots.length}`);
  roots.push(root);
  mkdirSync(root, { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(root, relativePath);
    mkdirSync(join(absolutePath, ".."), { recursive: true });
    writeFileSync(absolutePath, content);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Obsidian frontmatter and link parsing", () => {
  it("parses title, tags, source, author and publication date", () => {
    const result = parseFrontmatter(`---\ntitle: 一篇研究\nauthor: 作者\nsource: https://example.com/post\npublishedAt: 2026-07-01\ntags: [AI, 内容]\n---\n\n正文`);

    expect(result.attributes).toMatchObject({
      title: "一篇研究",
      author: "作者",
      source: "https://example.com/post",
      publishedAt: "2026-07-01",
      tags: ["AI", "内容"],
    });
    expect(result.body).toBe("正文");
  });

  it("supports markdown without frontmatter", () => {
    const result = parseFrontmatter("# 无元数据\n\n只有正文");
    expect(result.hasFrontmatter).toBe(false);
    expect(result.body).toContain("只有正文");
  });

  it("parses wiki links, external links and attachment embeds", () => {
    const result = parseObsidianLinks(
      "参考 [[研究笔记|别名]] 和 [[子目录/另一篇#结论]]，见 [来源](https://example.com/a)，附件 ![[images/a.png]] 与 ![图](images/b.jpg)",
    );

    expect(result.wikiLinks).toEqual([
      { target: "研究笔记", alias: "别名", embed: false },
      { target: "子目录/另一篇", alias: undefined, embed: false },
    ]);
    expect(result.externalLinks).toContain("https://example.com/a");
    expect(result.attachmentRefs).toEqual(["images/a.png", "images/b.jpg"]);
  });
});

describe("scanObsidianVault", () => {
  it("scans markdown read-only, returns relative paths and redacts risks", () => {
    const root = makeVault({
      ".obsidian/app.json": "private",
      ".DS_Store": "private",
      "2026/research.md": `---\ntitle: 研究笔记\nauthor: 外部作者\nsource: https://example.com/research\ntags: [AI]\n---\n\n这是一个足够长的外部研究摘要，用于验证只读扫描、来源提取、内容哈希和安全摘要。联系方式 138 1234 5678。\n\n![[images/reference.png]]`,
      "2026/no-source.md": "# 没来源\n\n这是一篇没有明确来源的笔记。",
      "empty.md": "",
      "images/reference.png": "not copied",
      "notes.txt": "should not be read as markdown",
    });
    const before = new Date(2026, 6, 13, 10, 0, 0);
    utimesSync(join(root, "2026/research.md"), before, before);

    const result = scanObsidianVault(root, { now: new Date("2026-07-13T04:00:00.000Z") });
    const note = result.notes.find((item) => item.relativePath === "2026/research.md");

    expect(result.discoveredCount).toBe(5);
    expect(result.markdownCount).toBe(3);
    expect(result.sourceItemCandidates).toBe(0);
    expect(result.quarantinedCount).toBe(1);
    expect(note?.modifiedAt).toBe(before.toISOString());
    expect(note?.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(note?.summary).not.toContain("138");
    expect(note?.relativePath).not.toContain(root);
    expect(result.notes.some((item) => item.relativePath.includes(".obsidian"))).toBe(false);
    expect(result.notes.find((item) => item.relativePath === "2026/no-source.md")?.riskFlags).toContain("unknown_source");
    expect(result.skippedCount).toBe(3);
  });

  it("reports exact duplicate content without merging different paths", () => {
    const root = makeVault({
      "a.md": "# 同一内容\n\n有来源 https://example.com/a",
      "b.md": "# 同一内容\n\n有来源 https://example.com/a",
    });
    const result = scanObsidianVault(root);
    expect(result.duplicateCount).toBe(1);
    expect(result.sourceItemCandidates).toBe(2);
    expect(result.notes.map((note) => note.relativePath)).toEqual(["a.md", "b.md"]);
  });

  it("keeps a stable content hash across repeated read-only scans", () => {
    const root = makeVault({ "note.md": "---\nsource: https://example.com/stable\n---\n\n稳定摘要" });
    const path = join(root, "note.md");
    const before = { content: readFileSync(path), mtimeMs: lstatSync(path).mtimeMs, mode: lstatSync(path).mode };
    const first = scanObsidianVault(root);
    const second = scanObsidianVault(root);
    expect(second.notes[0].contentHash).toBe(first.notes[0].contentHash);
    expect(JSON.stringify(second)).not.toContain(root);
    expect(readFileSync(path)).toEqual(before.content);
    expect(lstatSync(path).mtimeMs).toBe(before.mtimeMs);
    expect(lstatSync(path).mode).toBe(before.mode);
  });

  it("ignores symlinks that could escape the Vault", () => {
    const outside = makeVault({ "outside.md": "---\nsource: https://example.com/outside\n---\n\n外部哨兵内容" });
    const root = makeVault({ "inside.md": "---\nsource: https://example.com/inside\n---\n\n内部内容" });
    symlinkSync(join(outside, "outside.md"), join(root, "linked-file.md"));
    symlinkSync(outside, join(root, "linked-directory"));
    symlinkSync(join(outside, "missing.md"), join(root, "broken-link.md"));

    const result = scanObsidianVault(root);
    expect(result.markdownCount).toBe(1);
    expect(result.notes.map((note) => note.relativePath)).toEqual(["inside.md"]);
    expect(JSON.stringify(result)).not.toContain("外部哨兵内容");
  });

  it("rejects a configured Vault root that is itself a symlink", () => {
    const outside = makeVault({ "outside.md": "---\nsource: https://example.com/outside\n---\n\n外部哨兵内容" });
    const container = makeVault({});
    const linkedRoot = join(container, "linked-root");
    symlinkSync(outside, linkedRoot);
    expect(() => scanObsidianVault(linkedRoot)).toThrow("Vault root must not be a symbolic link");
  });

  it("ignores hidden, temporary, download and conflict-copy files", () => {
    const root = makeVault({
      "keep.md": "---\nsource: https://example.com/keep\n---\n\n保留",
      ".obsidian/app.md": "ignored",
      ".hidden.md": "ignored",
      "~$draft.md": "ignored",
      "draft.tmp": "ignored",
      "draft.temp": "ignored",
      "draft.swp": "ignored",
      "draft.swo": "ignored",
      "draft.bak": "ignored",
      "draft.part": "ignored",
      "draft.crdownload": "ignored",
      "draft.download": "ignored",
      "note 冲突副本.md": "ignored",
      "note conflicted copy.md": "ignored",
    });
    const result = scanObsidianVault(root);
    expect(result.discoveredCount).toBe(1);
    expect(result.markdownCount).toBe(1);
    expect(result.notes[0].relativePath).toBe("keep.md");
  });

  it("never exposes a detected secret through a candidate or summary", () => {
    const secret = `sk-${"B".repeat(24)}`;
    const root = makeVault({ "secret.md": `---\nsource: https://example.com/secret\n---\n\napi_key=${secret}` });
    const result = scanObsidianVault(root);
    expect(result.quarantinedCount).toBe(1);
    expect(result.sourceItemCandidates).toBe(0);
    expect(result.notes[0].riskFlags).toContain("secret_exposure");
    expect(result.notes[0].summary).not.toContain(secret);
  });
});
