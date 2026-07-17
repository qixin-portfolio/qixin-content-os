export type CreateSourceMode = "manual" | "project" | "x" | "external_material";
export type CreateStep = "source" | "topics" | "details" | "drafts" | "editor";
export type CreateGenerationMode = "model" | "deterministic_fallback";

export type FactSourceType = "raw_input" | "fact_answer" | "external_opinion" | "user_judgment";
export type FactCategory = "time" | "place" | "action" | "object" | "physical_feeling" | "emotion" | "project_state" | "result" | "external_claim" | "user_judgment" | "other";

export type FactLedgerFact = {
  id: string;
  text: string;
  sourceType: FactSourceType;
  category: FactCategory;
};

export type FactLedger = {
  sourceMode: CreateSourceMode;
  facts: FactLedgerFact[];
};

export type GroundingContext = {
  rawInput: string;
  sourceMode: CreateSourceMode;
  platform: "wechat_moments";
  confirmedUserStatements: string[];
  externalOpinionMarkers: string[];
  prohibitedClaims: string[];
  missingContext: string[];
};

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
  approachDescription?: string;
  qualityStatus?: "passed" | "repaired" | "rejected_for_ungrounded_details";
  rejectedReasons?: string[];
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
  factQuestions: string[];
  factAnswers: string[];
  detailMode: "enriched" | "sparse" | null;
  draftCandidates: CreateDraftCandidate[];
  selectedDraft: CreateDraftCandidate | null;
  editedContent: string;
  lightweightWarnings: string[];
  assetSuggestions: string[];
  currentStep: CreateStep;
  generationMode: CreateGenerationMode | null;
  generationNotice: string;
  qualityStatus: "passed" | "insufficient" | null;
  updatedAt: string;
};
