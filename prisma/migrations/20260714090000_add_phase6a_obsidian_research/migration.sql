-- Phase 6A keeps Obsidian content outside the real database during dry-run.
ALTER TABLE "SourceItem" ADD COLUMN "attachmentRefsJson" TEXT;
ALTER TABLE "SourceItem" ADD COLUMN "author" TEXT;
ALTER TABLE "SourceItem" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "SourceItem" ADD COLUMN "factEligibility" TEXT;
ALTER TABLE "SourceItem" ADD COLUMN "linksJson" TEXT;
ALTER TABLE "SourceItem" ADD COLUMN "modifiedAt" DATETIME;
ALTER TABLE "SourceItem" ADD COLUMN "publishedAt" DATETIME;
ALTER TABLE "SourceItem" ADD COLUMN "relativePath" TEXT;
ALTER TABLE "SourceItem" ADD COLUMN "riskFlagsJson" TEXT;
ALTER TABLE "SourceItem" ADD COLUMN "sourceCategory" TEXT;
ALTER TABLE "SourceItem" ADD COLUMN "sourceMissingAt" DATETIME;
ALTER TABLE "SourceItem" ADD COLUMN "summary" TEXT;
ALTER TABLE "SourceItem" ADD COLUMN "tagsJson" TEXT;

CREATE TABLE "SourceItemVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourceItemId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "modifiedAt" DATETIME,
  "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceItemVersion_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ScanRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectSourceId" TEXT NOT NULL,
  "vaultKey" TEXT NOT NULL,
  "scanMode" TEXT NOT NULL,
  "discoveredCount" INTEGER NOT NULL DEFAULT 0,
  "validCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0,
  "riskCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" DATETIME NOT NULL,
  "completedAt" DATETIME,
  "manifestHash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'running',
  CONSTRAINT "ScanRun_projectSourceId_fkey" FOREIGN KEY ("projectSourceId") REFERENCES "ProjectSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TopicCandidate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "targetAudience" TEXT NOT NULL,
  "userPainPoint" TEXT NOT NULL,
  "coreAngle" TEXT NOT NULL,
  "evidenceStrength" TEXT NOT NULL,
  "freshness" TEXT NOT NULL,
  "suggestedPlatformsJson" TEXT NOT NULL,
  "riskFlagsJson" TEXT NOT NULL,
  "sourceCategory" TEXT NOT NULL DEFAULT 'external_research',
  "factEligibility" TEXT NOT NULL DEFAULT 'unverified_reference',
  "researchWorthiness" BOOLEAN,
  "firstHandEvidenceNeeded" TEXT,
  "fitsCurrentProject" BOOLEAN,
  "humanNotes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'proposed',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "TopicCandidate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TopicCandidateSource" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "topicCandidateId" TEXT NOT NULL,
  "sourceItemId" TEXT NOT NULL,
  "relevance" TEXT NOT NULL,
  "sourceRole" TEXT NOT NULL,
  CONSTRAINT "TopicCandidateSource_topicCandidateId_fkey" FOREIGN KEY ("topicCandidateId") REFERENCES "TopicCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TopicCandidateSource_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProjectSource" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "displayName" TEXT,
  "sourcePath" TEXT,
  "repository" TEXT,
  "metadataJson" TEXT,
  "vaultKey" TEXT,
  "sourceCategory" TEXT,
  "rootFingerprint" TEXT,
  "lastScannedAt" DATETIME,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProjectSource" ("createdAt", "id", "metadataJson", "projectId", "repository", "sourceName", "sourcePath", "sourceType") SELECT "createdAt", "id", "metadataJson", "projectId", "repository", "sourceName", "sourcePath", "sourceType" FROM "ProjectSource";
DROP TABLE "ProjectSource";
ALTER TABLE "new_ProjectSource" RENAME TO "ProjectSource";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE UNIQUE INDEX "ProjectSource_vaultKey_key" ON "ProjectSource"("vaultKey");
CREATE INDEX "SourceItemVersion_sourceItemId_createdAt_idx" ON "SourceItemVersion"("sourceItemId", "createdAt");
CREATE INDEX "ScanRun_projectSourceId_startedAt_idx" ON "ScanRun"("projectSourceId", "startedAt");
CREATE UNIQUE INDEX "SourceItemVersion_sourceItemId_contentHash_key" ON "SourceItemVersion"("sourceItemId", "contentHash");
CREATE UNIQUE INDEX "TopicCandidate_projectId_title_key" ON "TopicCandidate"("projectId", "title");
CREATE UNIQUE INDEX "TopicCandidateSource_topicCandidateId_sourceItemId_key" ON "TopicCandidateSource"("topicCandidateId", "sourceItemId");
CREATE INDEX "TopicCandidateSource_sourceItemId_idx" ON "TopicCandidateSource"("sourceItemId");
CREATE UNIQUE INDEX "SourceItem_projectSourceId_relativePath_key" ON "SourceItem"("projectSourceId", "relativePath");
