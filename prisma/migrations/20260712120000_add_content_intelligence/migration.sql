-- AlterTable
ALTER TABLE "MasterContent" ADD COLUMN "factReferencesJson" TEXT;

-- CreateTable
CREATE TABLE "ContentScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventCardId" TEXT NOT NULL,
    "noveltyScore" INTEGER NOT NULL,
    "personalScore" INTEGER NOT NULL,
    "industryScore" INTEGER NOT NULL,
    "visualScore" INTEGER NOT NULL,
    "businessScore" INTEGER NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "recommendation" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentScore_eventCardId_fkey" FOREIGN KEY ("eventCardId") REFERENCES "EventCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentAngle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventCardId" TEXT NOT NULL,
    "angleType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "coreIdea" TEXT NOT NULL,
    "targetAudience" TEXT NOT NULL,
    "recommendedPlatformsJson" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentAngle_eventCardId_fkey" FOREIGN KEY ("eventCardId") REFERENCES "EventCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "preferredWordsJson" TEXT NOT NULL,
    "avoidWordsJson" TEXT NOT NULL,
    "writingRulesJson" TEXT NOT NULL,
    "exampleTextsJson" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentScore_eventCardId_key" ON "ContentScore"("eventCardId");
