export type SourceType = "github" | "markdown" | "document" | "image" | "manual";

export type SourceItemDraft = {
  sourceType: SourceType;
  title: string;
  content: string;
  sourceUrl?: string;
  sourcePath?: string;
  repository?: string;
  metadataJson?: string;
  visibility: "private" | "shared" | "public";
};

export type SourceItem = SourceItemDraft & {
  id: string;
  projectId: string;
};
