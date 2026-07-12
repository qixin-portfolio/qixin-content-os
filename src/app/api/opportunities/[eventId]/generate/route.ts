import { NextResponse } from "next/server";
import { z } from "zod";
import { generateMasterContentFromIntelligence } from "@/lib/ai/content-generator";
import { contentScoreFromPersistence, scoreEventCard } from "@/lib/content/content-scorer";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

const inputSchema = z.object({
  angleId: z.string().min(1),
  voiceProfileId: z.string().min(1),
});

function parseJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const raw = await request.json().catch(() => null);
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ errors: ["angleId and voiceProfileId are required"] }, { status: 400 });
  }

  const prisma = getPrisma();
  const event = await prisma.eventCard.findUnique({
    where: { id: eventId },
    include: { sourceItems: true, contentScore: true, contentAngles: true },
  });
  if (!event) return NextResponse.json({ errors: ["EventCard not found"] }, { status: 404 });

  const angle = event.contentAngles.find((item) => item.id === parsed.data.angleId);
  if (!angle) return NextResponse.json({ errors: ["ContentAngle not found for this EventCard"] }, { status: 404 });

  const voice = await prisma.voiceProfile.findUnique({ where: { id: parsed.data.voiceProfileId } });
  if (!voice) return NextResponse.json({ errors: ["VoiceProfile not found"] }, { status: 404 });

  const contentScore = event.contentScore
    ? contentScoreFromPersistence(event.contentScore)
    : scoreEventCard(event, event.sourceItems);
  if (!event.contentScore) {
    await prisma.contentScore.create({
      data: {
        eventCardId: event.id,
        noveltyScore: contentScore.novelty.score,
        personalScore: contentScore.personal.score,
        industryScore: contentScore.industry.score,
        visualScore: contentScore.visual.score,
        businessScore: contentScore.business.score,
        totalScore: contentScore.totalScore,
        recommendation: contentScore.recommendation,
        reason: contentScore.reason,
      },
    });
  }

  try {
    const draft = generateMasterContentFromIntelligence({
      eventCard: { ...event, sourceItems: event.sourceItems },
      contentScore,
      selectedAngle: {
        angleType: angle.angleType,
        title: angle.title,
        coreIdea: angle.coreIdea,
        targetAudience: angle.targetAudience,
        recommendedPlatforms: parseJsonArray(angle.recommendedPlatformsJson) as Array<"wechat_moments" | "x" | "xiaohongshu" | "douyin">,
        reason: angle.reason,
      },
      voiceProfile: {
        id: voice.id,
        name: voice.name,
        platform: voice.platform,
        tone: voice.tone,
        preferredWords: parseJsonArray(voice.preferredWordsJson),
        avoidWords: parseJsonArray(voice.avoidWordsJson),
        writingRules: parseJsonArray(voice.writingRulesJson),
        exampleTexts: parseJsonArray(voice.exampleTextsJson),
      },
    });

    const existingMaster = await prisma.masterContent.findUnique({
      where: { eventCardId: event.id },
      select: { id: true },
    });
    if (existingMaster) {
      return NextResponse.json(
        { errors: ["MasterContent already exists; existing content was not overwritten"] },
        { status: 409 },
      );
    }

    await prisma.contentAngle.updateMany({ where: { eventCardId: event.id }, data: { selected: false } });
    await prisma.contentAngle.update({ where: { id: angle.id }, data: { selected: true } });
    const masterContent = await prisma.masterContent.create({
      data: {
        eventCardId: event.id,
        title: draft.title,
        hook: draft.hook,
        story: draft.story,
        insight: draft.insight,
        reflection: draft.reflection,
        cta: draft.cta,
        factReferencesJson: JSON.stringify(draft.factReferences),
        status: "drafting",
      },
    });

    return NextResponse.json({ draft, masterContent }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ errors: [error instanceof Error ? error.message : "Content generation failed"] }, { status: 400 });
  }
}
