import { NextResponse } from "next/server";
import { z } from "zod";
import { createInitialEditorialDraftRecord } from "@/lib/editorial/revision-service";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

const platforms = ["wechat_moments", "x", "xiaohongshu", "douyin"] as const;
const createSchema = z.object({
  masterContentId: z.string().min(1),
  voiceProfileId: z.string().min(1).optional(),
  voiceProfileIds: z.object({
    wechat_moments: z.string().min(1).optional(),
    x: z.string().min(1).optional(),
    xiaohongshu: z.string().min(1).optional(),
    douyin: z.string().min(1).optional(),
  }).optional(),
}).refine((value) => value.voiceProfileId || value.voiceProfileIds, "voiceProfileId or voiceProfileIds is required");

export async function GET() {
  const drafts = await getPrisma().editorialDraft.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      masterContent: { include: { eventCard: { include: { project: true } } } },
      voiceProfile: { select: { id: true, name: true, platform: true } },
      styleReviews: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  return NextResponse.json(drafts.map((draft) => ({
    ...draft,
    latestStyleReview: draft.styleReviews[0] ?? null,
  })));
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ errors: ["masterContentId and a VoiceProfile are required"] }, { status: 400 });

  const prisma = getPrisma();
  const masterContent = await prisma.masterContent.findUnique({ where: { id: parsed.data.masterContentId } });
  if (!masterContent) return NextResponse.json({ errors: ["MasterContent not found"] }, { status: 404 });
  const drafts = [];
  for (const platform of platforms) {
    const voiceProfileId = parsed.data.voiceProfileIds?.[platform] ?? parsed.data.voiceProfileId;
    if (!voiceProfileId) return NextResponse.json({ errors: [`VoiceProfile is required for ${platform}`] }, { status: 400 });
    const voiceProfile = await prisma.voiceProfile.findUnique({ where: { id: voiceProfileId } });
    if (!voiceProfile) return NextResponse.json({ errors: [`VoiceProfile not found for ${platform}`] }, { status: 404 });
    if (voiceProfile.platform !== platform) return NextResponse.json({ errors: [`VoiceProfile platform mismatch for ${platform}`] }, { status: 400 });
    drafts.push(await createInitialEditorialDraftRecord(prisma, masterContent, platform, voiceProfile.id));
  }
  return NextResponse.json({ drafts }, { status: 201 });
}
