-- Add source-revision idempotency keys without rebuilding existing SQLite tables.
ALTER TABLE "DraftRevision" ADD COLUMN "approvedSourceRevisionId" TEXT;
ALTER TABLE "VoiceSample" ADD COLUMN "sourceRevisionId" TEXT;

-- Backfill the existing approved draft from its current approval revision to the
-- latest preceding non-approval revision. Rejected revisions are excluded because
-- only the current revision of an approved EditorialDraft is eligible.
UPDATE "DraftRevision"
SET "approvedSourceRevisionId" = (
    SELECT "source"."id"
    FROM "DraftRevision" AS "source"
    WHERE "source"."editorialDraftId" = "DraftRevision"."editorialDraftId"
      AND "source"."revisionNumber" < "DraftRevision"."revisionNumber"
      AND "source"."changeSource" <> 'human_approval'
    ORDER BY "source"."revisionNumber" DESC
    LIMIT 1
)
WHERE "DraftRevision"."changeSource" = 'human_approval'
  AND EXISTS (
      SELECT 1
      FROM "EditorialDraft"
      WHERE "EditorialDraft"."currentRevisionId" = "DraftRevision"."id"
        AND "EditorialDraft"."status" = 'approved'
  );

UPDATE "VoiceSample"
SET "sourceRevisionId" = (
    SELECT "approval"."approvedSourceRevisionId"
    FROM "EditorialDraft" AS "draft"
    JOIN "DraftRevision" AS "approval"
      ON "approval"."id" = "draft"."currentRevisionId"
    WHERE "draft"."id" = "VoiceSample"."sourceReferenceId"
      AND "draft"."status" = 'approved'
      AND "approval"."changeSource" = 'human_approval'
)
WHERE "VoiceSample"."sourceType" = 'approved_draft';

CREATE UNIQUE INDEX "DraftRevision_approvedSourceRevisionId_key"
ON "DraftRevision"("approvedSourceRevisionId");

CREATE UNIQUE INDEX "VoiceSample_sourceRevisionId_key"
ON "VoiceSample"("sourceRevisionId");
