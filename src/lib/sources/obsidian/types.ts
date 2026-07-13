export const OBSIDIAN_DISPLAY_NAME = "外部内容运营研究库";
export const OBSIDIAN_SOURCE_CATEGORY = "external_research" as const;
export const OBSIDIAN_FACT_ELIGIBILITY = "unverified_reference" as const;
export const TOPIC_PLATFORMS = ["wechat_moments", "xiaohongshu", "douyin", "x", "long_article"] as const;

export const RISK_FLAGS = [
  "phone_number",
  "wechat_contact",
  "local_absolute_path",
  "secret_exposure",
  "customer_privacy",
  "unknown_source",
  "copyright_risk",
  "outdated_data",
  "unverified_claim",
] as const;

export type RiskFlag = (typeof RISK_FLAGS)[number];

export type ObsidianWikiLink = {
  target: string;
  alias?: string;
  embed: boolean;
};

export type ObsidianLinks = {
  wikiLinks: ObsidianWikiLink[];
  externalLinks: string[];
  attachmentRefs: string[];
};

export type ObsidianNoteScan = {
  title: string;
  relativePath: string;
  sourceUrl?: string;
  author?: string;
  publishedAt?: string;
  modifiedAt: string;
  tags: string[];
  contentHash: string;
  summary: string;
  riskFlags: RiskFlag[];
  sourceCategory: typeof OBSIDIAN_SOURCE_CATEGORY;
  factEligibility: typeof OBSIDIAN_FACT_ELIGIBILITY;
  links: ObsidianLinks;
  isValid: boolean;
  isDuplicate: boolean;
  isQuarantined: boolean;
  isSourceItemCandidate: boolean;
};

export type ObsidianScanResult = {
  vaultKey: string;
  displayName: typeof OBSIDIAN_DISPLAY_NAME;
  rootFingerprint: string;
  lastScannedAt: string;
  discoveredCount: number;
  markdownCount: number;
  validCount: number;
  skippedCount: number;
  duplicateCount: number;
  riskCount: number;
  quarantinedCount: number;
  sourceItemCandidates: number;
  missingSource: number;
  brokenLinks: number;
  missingAttachments: number;
  manifestHash: string;
  notes: ObsidianNoteScan[];
};

export type TopicCandidateInput = {
  title: string;
  targetAudience: string;
  userPainPoint: string;
  coreAngle: string;
  relatedSourceRelativePaths: string[];
  evidenceStrength: "strong" | "medium" | "weak";
  freshness: string;
  suggestedPlatforms: (typeof TOPIC_PLATFORMS)[number][];
  riskFlags: RiskFlag[];
  status: "proposed";
};
