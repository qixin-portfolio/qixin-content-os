import { NextResponse } from "next/server";
import { z } from "zod";
import { suggestEditorialChanges } from "@/lib/editorial/rewrite-suggester";
import { createSuggestionRevision, runStyleReview } from "@/lib/editorial/revision-service";
import { toEditorialVoiceProfile, toEditorialVoiceSamples } from "@/lib/editorial/serialization";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

const revisionSchema = z.object({
  title: z.string(),
  body: z.string(),
  hook: z.string(),
  cta: z.string(),
  changeSummary: z.string().min(1),
});

async function loadDraft(draftId: string) {
  return getPrisma().editorialDraft.findUnique({
    where: { id: draftId },
    include: {
      voiceProfile: { include: { voiceSamples: { where: { active: true } } } },
      styleReviews: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const { draftId } = await params;
  const draft = await loadDraft(draftId);
  if (!draft) return NextResponse.json({ errors: ["EditorialDraft not found"] }, { status: 404 });
  if (!draft.voiceProfile) return NextResponse.json({ errors: ["VoiceProfile is required"] }, { status: 400 });

  const styleReview = draft.styleReviews[0] ?? await runStyleReview(getPrisma(), draftId);
  const suggestions = suggestEditorialChanges({
    editorialDraft: draft,
    styleReview: {
      overallScore: styleReview.overallScore,
      aiToneScore: styleReview.aiToneScore,
      authenticityScore: styleReview.authenticityScore,
      clarityScore: styleReview.clarityScore,
      salesToneScore: styleReview.salesToneScore,
      issues: JSON.parse(styleReview.issuesJson),
      suggestions: JSON.parse(styleReview.suggestionsJson),
    },
    voiceProfile: toEditorialVoiceProfile(draft.voiceProfile),
    voiceSamples: toEditorialVoiceSamples(draft.voiceProfile.voiceSamples),
  });
  return NextResponse.json({ styleReview, suggestions });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const { draftId } = await params;
  const parsed = revisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ errors: ["title, body, hook, cta and changeSummary are required"] }, { status: 400 });
  try {
    const prisma = getPrisma();
    const revision = await createSuggestionRevision(prisma, draftId, parsed.data);
    const styleReview = await runStyleReview(prisma, draftId);
    return NextResponse.json({ revision, styleReview });
  } catch (error) {
    return NextResponse.json({ errors: [error instanceof Error ? error.message : "Suggestion revision failed"] }, { status: 400 });
  }
}
