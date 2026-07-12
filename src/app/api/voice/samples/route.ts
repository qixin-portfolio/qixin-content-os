import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

const sampleSchema = z.object({
  voiceProfileId: z.string().min(1),
  platform: z.enum(["wechat_moments", "x", "xiaohongshu", "douyin"]),
  title: z.string().min(1),
  body: z.string().min(1),
  qualityRating: z.number().int().min(1).max(5),
  notes: z.string().default(""),
});

export async function GET() {
  const samples = await getPrisma().voiceSample.findMany({ orderBy: { updatedAt: "desc" }, include: { voiceProfile: { select: { id: true, name: true } } } });
  return NextResponse.json(samples);
}

export async function POST(request: Request) {
  const parsed = sampleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ errors: ["voiceProfileId, platform, title, body and qualityRating are required"] }, { status: 400 });
  const voiceProfile = await getPrisma().voiceProfile.findUnique({ where: { id: parsed.data.voiceProfileId } });
  if (!voiceProfile) return NextResponse.json({ errors: ["VoiceProfile not found"] }, { status: 404 });
  const sample = await getPrisma().voiceSample.create({
    data: {
      ...parsed.data,
      sourceType: "manual_input",
      sourceReferenceId: `manual:${crypto.randomUUID()}`,
      approved: true,
      active: true,
    },
  });
  return NextResponse.json(sample, { status: 201 });
}
