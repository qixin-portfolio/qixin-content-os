import type { Prisma, PrismaClient } from "@prisma/client";
import { adaptMasterContentForEditorial } from "../content/platform-adapter.ts";
import { reviewEditorialStyle, type EditorialVoiceProfile, type EditorialVoiceSample } from "./style-reviewer.ts";

export type EditorialPlatform = "wechat_moments" | "x" | "xiaohongshu" | "douyin";

export type EditorialDraftContent = {
  platform: EditorialPlatform;
  title: string;
  body: string;
  hook: string;
  cta: string;
};

export type RevisionInput = {
  title: string;
  body: string;
  hook: string;
  cta: string;
  changeSummary: string;
};

export type ApprovalInput = {
  overrideReason?: string;
  qualityRating?: number;
  notes?: string;
};

type MasterContentForEditorial = {
  id: string;
  eventCardId: string;
  title: string;
  hook: string;
  story: string;
  insight: string;
  reflection: string;
  cta: string;
  status: string;
};

type EditorialDatabase = PrismaClient | Prisma.TransactionClient;

const approvalLocks = new Map<string, Promise<unknown>>();

async function withApprovalLock<T>(editorialDraftId: string, operation: () => Promise<T>) {
  const previous = approvalLocks.get(editorialDraftId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  approvalLocks.set(editorialDraftId, current);
  try {
    return await current;
  } finally {
    if (approvalLocks.get(editorialDraftId) === current) approvalLocks.delete(editorialDraftId);
  }
}

export function createInitialEditorialDraft(
  masterContent: MasterContentForEditorial,
  platform: EditorialPlatform,
): EditorialDraftContent {
  const adapted = adaptMasterContentForEditorial(masterContent);
  const content = adapted[platform];
  return {
    platform,
    title: content.title,
    body: content.body,
    hook: content.hook,
    cta: content.cta,
  };
}

function parseJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function profileForReview(profile: {
  id: string;
  name: string;
  platform: EditorialPlatform;
  tone: string;
  preferredWordsJson: string;
  avoidWordsJson: string;
  writingRulesJson: string;
  exampleTextsJson: string;
}): EditorialVoiceProfile {
  return {
    id: profile.id,
    name: profile.name,
    platform: profile.platform,
    tone: profile.tone,
    preferredWords: parseJsonArray(profile.preferredWordsJson),
    avoidWords: parseJsonArray(profile.avoidWordsJson),
    writingRules: parseJsonArray(profile.writingRulesJson),
    exampleTexts: parseJsonArray(profile.exampleTextsJson),
  };
}

function samplesForReview(samples: Array<{
  platform: EditorialPlatform;
  title: string;
  body: string;
  qualityRating: number;
  approved: boolean;
}>): EditorialVoiceSample[] {
  return samples.map((sample) => ({
    platform: sample.platform,
    title: sample.title,
    body: sample.body,
    qualityRating: sample.qualityRating,
    approved: sample.approved,
  }));
}

async function runStyleReview(prisma: EditorialDatabase, editorialDraftId: string) {
  const draft = await prisma.editorialDraft.findUniqueOrThrow({
    where: { id: editorialDraftId },
    include: { voiceProfile: { include: { voiceSamples: true } } },
  });
  if (!draft.voiceProfile) throw new Error("VoiceProfile is required for StyleReview");

  const review = reviewEditorialStyle({
    title: draft.title,
    hook: draft.hook,
    body: draft.body,
    cta: draft.cta,
    voiceProfile: profileForReview(draft.voiceProfile),
    voiceSamples: samplesForReview(draft.voiceProfile.voiceSamples),
  });
  return prisma.styleReview.create({
    data: {
      editorialDraftId,
      overallScore: review.overallScore,
      aiToneScore: review.aiToneScore,
      authenticityScore: review.authenticityScore,
      clarityScore: review.clarityScore,
      salesToneScore: review.salesToneScore,
      issuesJson: JSON.stringify(review.issues),
      suggestionsJson: JSON.stringify(review.suggestions),
    },
  });
}

export async function createInitialEditorialDraftRecord(
  prisma: PrismaClient,
  masterContent: MasterContentForEditorial,
  platform: EditorialPlatform,
  voiceProfileId?: string,
) {
  const existing = await prisma.editorialDraft.findUnique({
    where: { masterContentId_platform: { masterContentId: masterContent.id, platform } },
  });
  if (existing) return existing;

  const content = createInitialEditorialDraft(masterContent, platform);
  const draft = await prisma.editorialDraft.create({
    data: {
      masterContentId: masterContent.id,
      voiceProfileId,
      platform,
      title: content.title,
      body: content.body,
      hook: content.hook,
      cta: content.cta,
      status: "needs_review",
    },
  });
  const revision = await prisma.draftRevision.create({
    data: {
      editorialDraftId: draft.id,
      revisionNumber: 1,
      title: content.title,
      body: content.body,
      hook: content.hook,
      cta: content.cta,
      changeSource: "ai_initial",
      changeSummary: "从 MasterContent 生成平台初始草稿",
    },
  });
  await prisma.editorialDraft.update({
    where: { id: draft.id },
    data: { currentRevisionId: revision.id },
  });
  if (voiceProfileId) await runStyleReview(prisma, draft.id);
  return prisma.editorialDraft.findUniqueOrThrow({ where: { id: draft.id } });
}

async function createRevision(
  prisma: PrismaClient,
  editorialDraftId: string,
  input: RevisionInput,
  changeSource: "ai_suggestion" | "human_edit" | "human_approval",
) {
  if (!input.changeSummary.trim()) throw new Error("changeSummary is required");
  await prisma.editorialDraft.findUniqueOrThrow({ where: { id: editorialDraftId } });
  const latest = await prisma.draftRevision.findFirst({
    where: { editorialDraftId },
    orderBy: { revisionNumber: "desc" },
  });
  const revision = await prisma.draftRevision.create({
    data: {
      editorialDraftId,
      revisionNumber: (latest?.revisionNumber ?? 0) + 1,
      ...input,
      changeSource,
    },
  });
  await prisma.editorialDraft.update({
    where: { id: editorialDraftId },
    data: {
      title: input.title,
      body: input.body,
      hook: input.hook,
      cta: input.cta,
      currentRevisionId: revision.id,
      status: changeSource === "human_approval" ? "approved" : "editing",
      approvedAt: changeSource === "human_approval" ? new Date() : null,
    },
  });
  return revision;
}

export function createHumanRevision(prisma: PrismaClient, editorialDraftId: string, input: RevisionInput) {
  return createRevision(prisma, editorialDraftId, input, "human_edit");
}

export function createSuggestionRevision(prisma: PrismaClient, editorialDraftId: string, input: RevisionInput) {
  return createRevision(prisma, editorialDraftId, input, "ai_suggestion");
}

export async function approveEditorialDraft(
  prisma: PrismaClient,
  editorialDraftId: string,
  input: ApprovalInput = {},
) {
  if (
    input.qualityRating !== undefined
    && (!Number.isInteger(input.qualityRating) || input.qualityRating < 1 || input.qualityRating > 5)
  ) {
    throw new Error("qualityRating must be between 1 and 5");
  }

  return withApprovalLock(editorialDraftId, async () => {
    let sourceRevisionId: string | undefined;
    try {
      return await prisma.$transaction(async (transaction) => {
        const draft = await transaction.editorialDraft.findUniqueOrThrow({
          where: { id: editorialDraftId },
          include: { currentRevision: true, voiceProfile: true },
        });
        if (!draft.voiceProfile) throw new Error("VoiceProfile is required before approval");
        if (!draft.currentRevision) throw new Error("EditorialDraft current Revision is required before approval");

        sourceRevisionId = draft.currentRevision.changeSource === "human_approval"
          ? draft.currentRevision.approvedSourceRevisionId ?? undefined
          : draft.currentRevision.id;
        if (!sourceRevisionId) {
          throw new Error("Current human_approval Revision has no approved source Revision");
        }

        const existingRevision = await transaction.draftRevision.findUnique({
          where: { approvedSourceRevisionId: sourceRevisionId },
        });
        if (existingRevision) {
          const existingSample = await transaction.voiceSample.findUnique({
            where: { sourceRevisionId },
          });
          if (!existingSample) {
            throw new Error("Approval data integrity violation: approved VoiceSample is missing");
          }
          return {
            ...existingRevision,
            status: "approved" as const,
            voiceSampleId: existingSample.id,
            idempotent: true,
          };
        }

        const review = await runStyleReview(transaction, editorialDraftId);
        if (review.overallScore < 70 && !input.overrideReason?.trim()) {
          throw new Error("StyleReview overallScore is below 70; overrideReason is required");
        }

        const latest = await transaction.draftRevision.findFirst({
          where: { editorialDraftId },
          orderBy: { revisionNumber: "desc" },
        });
        const approvalSummary = input.overrideReason?.trim()
          ? `人工批准，覆盖 StyleReview 限制：${input.overrideReason.trim()}`
          : "人工批准当前版本";
        const revision = await transaction.draftRevision.create({
          data: {
            editorialDraftId,
            approvedSourceRevisionId: sourceRevisionId,
            revisionNumber: (latest?.revisionNumber ?? 0) + 1,
            title: draft.title,
            body: draft.body,
            hook: draft.hook,
            cta: draft.cta,
            changeSource: "human_approval",
            changeSummary: approvalSummary,
          },
        });
        const approvedAt = new Date();
        await transaction.editorialDraft.update({
          where: { id: editorialDraftId },
          data: {
            currentRevisionId: revision.id,
            status: "approved",
            approvedAt,
          },
        });
        const voiceSample = await transaction.voiceSample.create({
          data: {
            voiceProfileId: draft.voiceProfile.id,
            platform: draft.platform,
            title: draft.title,
            body: [draft.hook, draft.body, draft.cta].filter(Boolean).join("\n\n"),
            sourceType: "approved_draft",
            sourceReferenceId: draft.id,
            sourceRevisionId,
            qualityRating: input.qualityRating ?? 3,
            notes: input.notes?.trim() || "由人工批准稿沉淀，待进一步人工评分。",
            approved: true,
            active: true,
          },
        });
        return {
          ...revision,
          status: "approved" as const,
          voiceSampleId: voiceSample.id,
          idempotent: false,
        };
      });
    } catch (error) {
      if (sourceRevisionId) {
        const existingRevision = await prisma.draftRevision.findUnique({
          where: { approvedSourceRevisionId: sourceRevisionId },
        });
        if (existingRevision) {
          const existingSample = await prisma.voiceSample.findUnique({
            where: { sourceRevisionId },
          });
          if (existingSample) {
            return {
              ...existingRevision,
              status: "approved" as const,
              voiceSampleId: existingSample.id,
              idempotent: true,
            };
          }
        }
      }
      throw error;
    }
  });
}

export async function rejectEditorialDraft(prisma: PrismaClient, editorialDraftId: string, reason: string) {
  if (!reason.trim()) throw new Error("rejection reason is required");
  const draft = await prisma.editorialDraft.findUniqueOrThrow({ where: { id: editorialDraftId } });
  const latest = await prisma.draftRevision.findFirst({ where: { editorialDraftId }, orderBy: { revisionNumber: "desc" } });
  const revision = await prisma.draftRevision.create({
    data: {
      editorialDraftId,
      revisionNumber: (latest?.revisionNumber ?? 0) + 1,
      title: draft.title,
      body: draft.body,
      hook: draft.hook,
      cta: draft.cta,
      changeSource: "human_approval",
      changeSummary: `人工拒绝：${reason.trim()}`,
    },
  });
  await prisma.editorialDraft.update({ where: { id: editorialDraftId }, data: { status: "rejected", currentRevisionId: revision.id } });
  return prisma.editorialDraft.findUniqueOrThrow({ where: { id: editorialDraftId } });
}

export { runStyleReview };
