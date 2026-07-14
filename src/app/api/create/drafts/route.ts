import { NextResponse } from "next/server";
import { z } from "zod";
import { generateCreateDrafts } from "@/lib/create/draft-generator";
import { toEditorialVoiceProfile } from "@/lib/editorial/serialization";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

const topicSchema = z.object({
  key: z.enum(["record", "perspective", "focus"]),
  title: z.string().min(1),
  whyWorthWriting: z.string().min(1),
  recommendedAngle: z.string().min(1),
  platform: z.literal("朋友圈"),
  missingInformation: z.string(),
});

const inputSchema = z.object({
  sourceMode: z.enum(["manual", "project"]),
  sourceText: z.string().min(1),
  platform: z.literal("wechat_moments"),
  topic: topicSchema,
});

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ errors: ["选题或创作来源不完整"] }, { status: 400 });
  }

  try {
    const prisma = getPrisma();
    const [profile, samples] = await Promise.all([
      prisma.voiceProfile.findFirst({
        where: { platform: "wechat_moments" },
        orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
      }),
      prisma.voiceSample.findMany({
        where: { platform: "wechat_moments", approved: true, active: true },
        orderBy: [{ qualityRating: "desc" }, { updatedAt: "desc" }],
        select: {
          platform: true,
          title: true,
          body: true,
          qualityRating: true,
          sourceType: true,
          approved: true,
          active: true,
        },
      }),
    ]);
    const drafts = generateCreateDrafts({
      ...parsed.data,
      voiceProfile: profile ? toEditorialVoiceProfile(profile) : null,
      voiceSamples: samples,
    });
    return NextResponse.json({ drafts });
  } catch (error) {
    return NextResponse.json({
      errors: [error instanceof Error ? error.message : "候选稿生成失败，请重试"],
    }, { status: 400 });
  }
}
