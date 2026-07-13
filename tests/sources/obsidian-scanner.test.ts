import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
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

  it("identifies exact duplicate markdown by content hash", () => {
    const root = makeVault({
      "a.md": "# 同一内容\n\n有来源 https://example.com/a",
      "b.md": "# 同一内容\n\n有来源 https://example.com/a",
    });
    const result = scanObsidianVault(root);
    expect(result.duplicateCount).toBe(1);
    expect(result.sourceItemCandidates).toBe(1);
  });

  it("keeps a stable content hash across repeated read-only scans", () => {
    const root = makeVault({ "note.md": "---\nsource: https://example.com/stable\n---\n\n稳定摘要" });
    const first = scanObsidianVault(root);
    const second = scanObsidianVault(root);
    expect(second.notes[0].contentHash).toBe(first.notes[0].contentHash);
    expect(JSON.stringify(second)).not.toContain(root);
  });
});
