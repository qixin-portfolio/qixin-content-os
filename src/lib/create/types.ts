export type CreateSourceMode = "manual" | "project" | "x";
export type CreateStep = "source" | "topics" | "drafts" | "editor";
export type CreateGenerationMode = "model" | "deterministic_fallback";

export type ContentBrief = {
  whatHappened: string;
  concreteDetails: string[];
  personalReaction: string | null;
  tension: string | null;
  personalJudgment: string | null;
  unresolvedQuestion: string | null;
  possibleNextStep: string | null;
  confirmedFacts: string[];
  unverifiedClaims: string[];
  prohibitedClaims: string[];
  missingContext: string[];
  externalReferences: string[];
};

export type RecentProjectOption = {
  name: string;
  summary: string;
  occurredAt: string;
  status: string;
  sourceText: string;
  isDemo?: boolean;
};

export type CreateTopicCandidate = {
  key: "record" | "perspective" | "focus";
  title: string;
  whyWorthWriting: string;
  recommendedAngle: string;
  platform: "朋友圈";
  missingInformation: string;
  sourceBasis: string;
  difference: string;
};

export type CreateSafetyCheck = {
  sourceSummary: string;
  unconfirmedFacts: string[];
  privacyRisks: string[];
  imageNotes: string[];
};

export type CreateDraftCandidate = {
  key: "record" | "perspective" | "concise";
  name: "真实记录版" | "个人观点版" | "克制短版";
  body: string;
  difference: string;
  lightweightWarnings: string[];
  assetSuggestions: string[];
  safety: CreateSafetyCheck;
};

export type CreateSession = {
  version: 1;
  sourceMode: CreateSourceMode | null;
  manualInput: string;
  selectedProject: RecentProjectOption | null;
  topicCandidates: CreateTopicCandidate[];
  selectedTopic: CreateTopicCandidate | null;
  draftCandidates: CreateDraftCandidate[];
  selectedDraft: CreateDraftCandidate | null;
  editedContent: string;
  lightweightWarnings: string[];
  assetSuggestions: string[];
  currentStep: CreateStep;
  contentBrief: ContentBrief | null;
  generationMode: CreateGenerationMode | null;
  generationNotice: string;
  qualityStatus: "passed" | "insufficient" | null;
  updatedAt: string;
};
