import { NextResponse } from "next/server";
import { z } from "zod";
import { generateDraftPackage } from "@/lib/create/generation-service";
import { getPrisma } from "@/lib/prisma";
import { createGenerationProvider } from "@/lib/create/provider-factory";
import { extractVoiceStyleProfile, selectVoiceSamplesForPrompt, summarizeVoiceStyle } from "@/lib/create/voice-style";
import { createProviderHttpStatus, isCreateProviderError, LocalFallbackProvider } from "@/lib/create/provider";

export const runtime = "nodejs";
export const maxDuration = 75;

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

const inputSchema = z.object({
  sourceMode: z.enum(["manual", "project"]),
  sourceText: z.string().min(1),
  platform: z.literal("wechat_moments"),
  topic: topicSchema,
  factAnswers: z.array(z.string()).max(3).default([]),
  detailMode: z.enum(["enriched", "sparse"]).default("sparse"),
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
    const promptSamples = selectVoiceSamplesForPrompt(samples);
    const voiceStyleSummary = summarizeVoiceStyle(extractVoiceStyleProfile(promptSamples));
    const provider = request.headers.get("x-use-local-demo") === "true"
      ? new LocalFallbackProvider()
      : createGenerationProvider();
    const result = await generateDraftPackage({
      provider,
      topic: parsed.data.topic,
      sourceMode: parsed.data.sourceMode,
      sourceText: parsed.data.sourceText,
      voiceStyleSummary,
      voiceSamples: samples,
      factAnswers: parsed.data.factAnswers.map((answer) => answer.trim()).filter(Boolean),
      detailMode: parsed.data.detailMode,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (isCreateProviderError(error)) {
      return NextResponse.json({
        errors: [error.message],
        classification: error.code,
        fallback: false,
        localFallbackAvailable: true,
      }, { status: createProviderHttpStatus(error) });
    }
    return NextResponse.json({
      errors: [error instanceof Error ? error.message : "候选稿生成失败，请重试"],
    }, { status: 400 });
  }
}
