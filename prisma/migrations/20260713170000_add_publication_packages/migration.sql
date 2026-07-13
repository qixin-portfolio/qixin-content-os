-- CreateTable
CREATE TABLE "PublicationPackage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editorialDraftId" TEXT NOT NULL,
    "sourceRevisionId" TEXT NOT NULL,
    "approvalRevisionId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "title" TEXT,
    "hook" TEXT,
    "body" TEXT NOT NULL,
    "cta" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "evidenceSnapshotJson" TEXT NOT NULL,
    "factBoundaryJson" TEXT NOT NULL,
    "assetBriefJson" TEXT NOT NULL,
    "publishChecklistJson" TEXT NOT NULL,
    "packageHash" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "publishedUrl" TEXT,
    "publishNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PublicationPackage_editorialDraftId_fkey" FOREIGN KEY ("editorialDraftId") REFERENCES "EditorialDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PublicationPackage_sourceRevisionId_fkey" FOREIGN KEY ("sourceRevisionId") REFERENCES "DraftRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PublicationPackage_approvalRevisionId_fkey" FOREIGN KEY ("approvalRevisionId") REFERENCES "DraftRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PublicationExport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicationPackageId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicationExport_publicationPackageId_fkey" FOREIGN KEY ("publicationPackageId") REFERENCES "PublicationPackage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicationPackage_sourceRevisionId_platform_key"
ON "PublicationPackage"("sourceRevisionId", "platform");

-- CreateIndex
CREATE INDEX "PublicationPackage_editorialDraftId_idx"
ON "PublicationPackage"("editorialDraftId");

-- CreateIndex
CREATE INDEX "PublicationExport_publicationPackageId_idx"
ON "PublicationExport"("publicationPackageId");
