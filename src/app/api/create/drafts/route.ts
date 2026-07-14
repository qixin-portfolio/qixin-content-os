import { NextResponse } from "next/server";
import { z } from "zod";
import { generateDraftPackage, withProviderFallback } from "@/lib/create/generation-service";
import { getPrisma } from "@/lib/prisma";
import { createGenerationProvider } from "@/lib/create/provider-factory";
import { extractVoiceStyleProfile } from "@/lib/create/voice-style";

export const runtime = "nodejs";

const topicSchema = z.object({
  key: z.enum(["record", "perspective", "focus"]),
  title: z.string().min(1),
  whyWorthWriting: z.string().min(1),
  recommendedAngle: z.string().min(1),
  platform: z.literal("朋友圈"),
  missingInformation: z.string(),
  sourceBasis: z.string(),
  difference: z.string(),
});

const briefSchema = z.object({
  whatHappened: z.string(),
  concreteDetails: z.array(z.string()),
  personalReaction: z.string().nullable(),
  tension: z.string().nullable(),
  personalJudgment: z.string().nullable(),
  unresolvedQuestion: z.string().nullable(),
  possibleNextStep: z.string().nullable(),
  confirmedFacts: z.array(z.string()),
  unverifiedClaims: z.array(z.string()),
  prohibitedClaims: z.array(z.string()),
  missingContext: z.array(z.string()),
  externalReferences: z.array(z.string()),
});

const inputSchema = z.object({
  sourceMode: z.enum(["manual", "project"]),
  sourceText: z.string().min(1),
  platform: z.literal("wechat_moments"),
  topic: topicSchema,
  brief: briefSchema,
});

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ errors: ["选题或创作来源不完整"] }, { status: 400 });
  }

  try {
    const prisma = getPrisma();
    const samples = await prisma.voiceSample.findMany({
      where: { platform: "wechat_moments", approved: true, active: true },
      orderBy: [{ qualityRating: "desc" }, { updatedAt: "desc" }],
      select: {
        platform: true,
        body: true,
        qualityRating: true,
        sourceType: true,
        approved: true,
        active: true,
      },
    });
    const provider = createGenerationProvider();
    const result = await withProviderFallback(provider, (activeProvider) => generateDraftPackage({
      provider: activeProvider,
      brief: parsed.data.brief,
      topic: parsed.data.topic,
      sourceMode: parsed.data.sourceMode,
      sourceText: parsed.data.sourceText,
      voiceStyle: extractVoiceStyleProfile(samples),
      voiceSamples: samples,
    }));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      errors: [error instanceof Error ? error.message : "候选稿生成失败，请重试"],
    }, { status: 400 });
  }
}
