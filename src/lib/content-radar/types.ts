export type SourcePlatform = "x" | "wechat" | "feishu" | "web" | "manual" | "unknown";

export type RadarConfig = {
  vaultPath: string;
  allowedRoots: string[];
  ignoredPatterns: string[];
  maxFileSizeBytes: number;
};

export type MaterialIndexItem = {
  sourceId: string;
  relativePath: string;
  title: string;
  author: string;
  sourceUrl: string | null;
  sourcePlatform: SourcePlatform;
  savedAt: string | null;
  modifiedAt: string;
  tags: string[];
  excerpt: string;
  contentHash: string;
  wordCount: number;
  size: number;
  identifiers: string[];
  oversized?: boolean;
};

export type MaterialIndex = {
  version: 1;
  parserVersion?: 2;
  items: MaterialIndexItem[];
};

export type ScanSummary = {
  status: "ok";
  scanned: number;
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  errors: string[];
};

export type ScanResult = {
  index: MaterialIndex;
  summary: ScanSummary;
};

export type MaterialSearchResult = Pick<MaterialIndexItem, "sourceId" | "title" | "author" | "relativePath" | "sourceUrl" | "sourcePlatform" | "savedAt" | "excerpt"> & {
  matchedTerms: string[];
  matchReason: string;
};
