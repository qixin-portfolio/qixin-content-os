import { describe, expect, it } from "vitest";
import { importMarkdown } from "../../src/lib/importers/markdown";

describe("importMarkdown", () => {
  it("creates a markdown SourceItem draft without changing the source text", () => {
    const markdown = "# 项目交接记录\n\n已完成资料整理，当前仍待补充截图。";

    expect(importMarkdown(markdown)).toEqual({
      sourceType: "markdown",
      title: "项目交接记录",
      content: markdown,
      visibility: "private",
    });
  });

  it("uses a stable fallback title when no heading exists", () => {
    expect(importMarkdown("没有标题的记录").title).toBe("未命名 Markdown 素材");
  });
});
