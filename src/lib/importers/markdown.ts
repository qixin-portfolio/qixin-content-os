import type { SourceItemDraft } from "./types";

export function importMarkdown(markdown: string): SourceItemDraft {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();

  return {
    sourceType: "markdown",
    title: heading || "未命名 Markdown 素材",
    content: markdown,
    visibility: "private",
  };
}
