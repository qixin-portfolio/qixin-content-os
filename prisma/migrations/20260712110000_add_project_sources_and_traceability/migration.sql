-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProjectSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourcePath" TEXT,
    "repository" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "projectSourceId" TEXT,
    "sourceType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourcePath" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourceItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SourceItem_projectSourceId_fkey" FOREIGN KEY ("projectSourceId") REFERENCES "ProjectSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "whatHappened" TEXT NOT NULL,
    "whyItMatters" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "personalReflection" TEXT NOT NULL,
    "evidenceRequired" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'inbox',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventCard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MasterContent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventCardId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "story" TEXT NOT NULL,
    "insight" TEXT NOT NULL,
    "reflection" TEXT NOT NULL,
    "cta" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'drafting',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MasterContent_eventCardId_fkey" FOREIGN KEY ("eventCardId") REFERENCES "EventCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlatformVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "masterContentId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'drafting',
    CONSTRAINT "PlatformVariant_masterContentId_fkey" FOREIGN KEY ("masterContentId") REFERENCES "MasterContent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventCardId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    CONSTRAINT "Asset_eventCardId_fkey" FOREIGN KEY ("eventCardId") REFERENCES "EventCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PublishRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platformVariantId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "publishedUrl" TEXT,
    "publishedAt" DATETIME,
    "metricsJson" TEXT,
    CONSTRAINT "PublishRecord_platformVariantId_fkey" FOREIGN KEY ("platformVariantId") REFERENCES "PlatformVariant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_EventCardToSourceItem" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_EventCardToSourceItem_A_fkey" FOREIGN KEY ("A") REFERENCES "EventCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_EventCardToSourceItem_B_fkey" FOREIGN KEY ("B") REFERENCES "SourceItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "MasterContent_eventCardId_key" ON "MasterContent"("eventCardId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformVariant_masterContentId_platform_key" ON "PlatformVariant"("masterContentId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "_EventCardToSourceItem_AB_unique" ON "_EventCardToSourceItem"("A", "B");

-- CreateIndex
CREATE INDEX "_EventCardToSourceItem_B_index" ON "_EventCardToSourceItem"("B");
