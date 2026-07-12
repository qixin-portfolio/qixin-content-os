import { NextResponse } from "next/server";
import { z } from "zod";
import { createHumanRevision, runStyleReview } from "@/lib/editorial/revision-service";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

const revisionSchema = z.object({
  title: z.string(),
  body: z.string(),
  hook: z.string(),
  cta: z.string(),
  changeSummary: z.string().min(1),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const { draftId } = await params;
  const draft = await getPrisma().editorialDraft.findUnique({
    where: { id: draftId },
    include: {
      masterContent: { include: { eventCard: { include: { project: true, sourceItems: true }, }, } },
      voiceProfile: { include: { voiceSamples: { where: { active: true } } } },
      revisions: { orderBy: { revisionNumber: "desc" } },
      styleReviews: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!draft) return NextResponse.json({ errors: ["EditorialDraft not found"] }, { status: 404 });
  return NextResponse.json(draft);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const { draftId } = await params;
  const parsed = revisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ errors: ["title, body, hook, cta and changeSummary are required"] }, { status: 400 });

  try {
    const prisma = getPrisma();
    const revision = await createHumanRevision(prisma, draftId, parsed.data);
    const styleReview = await runStyleReview(prisma, draftId);
    return NextResponse.json({ revision, styleReview });
  } catch (error) {
    return NextResponse.json({ errors: [error instanceof Error ? error.message : "Revision failed"] }, { status: 400 });
  }
}
