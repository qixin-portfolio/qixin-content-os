-- CreateTable
CREATE TABLE "EditorialDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "masterContentId" TEXT NOT NULL,
    "voiceProfileId" TEXT,
    "platform" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "cta" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currentRevisionId" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EditorialDraft_masterContentId_fkey" FOREIGN KEY ("masterContentId") REFERENCES "MasterContent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EditorialDraft_voiceProfileId_fkey" FOREIGN KEY ("voiceProfileId") REFERENCES "VoiceProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EditorialDraft_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "DraftRevision" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DraftRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editorialDraftId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "cta" TEXT NOT NULL,
    "changeSource" TEXT NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DraftRevision_editorialDraftId_fkey" FOREIGN KEY ("editorialDraftId") REFERENCES "EditorialDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceSample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "voiceProfileId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceReferenceId" TEXT NOT NULL,
    "qualityRating" INTEGER NOT NULL,
    "notes" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VoiceSample_voiceProfileId_fkey" FOREIGN KEY ("voiceProfileId") REFERENCES "VoiceProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StyleReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editorialDraftId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "aiToneScore" INTEGER NOT NULL,
    "authenticityScore" INTEGER NOT NULL,
    "clarityScore" INTEGER NOT NULL,
    "salesToneScore" INTEGER NOT NULL,
    "issuesJson" TEXT NOT NULL,
    "suggestionsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StyleReview_editorialDraftId_fkey" FOREIGN KEY ("editorialDraftId") REFERENCES "EditorialDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EditorialDraft_currentRevisionId_key" ON "EditorialDraft"("currentRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "EditorialDraft_masterContentId_platform_key" ON "EditorialDraft"("masterContentId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "DraftRevision_editorialDraftId_revisionNumber_key" ON "DraftRevision"("editorialDraftId", "revisionNumber");
