import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { contentScoreFromPersistence, scoreEventCard } from "@/lib/content/content-scorer";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const event = await getPrisma().eventCard.findUnique({
    where: { id: eventId },
    include: {
      project: true,
      sourceItems: true,
      contentScore: true,
      contentAngles: true,
      masterContent: true,
    },
  });

  if (!event) return NextResponse.json({ errors: ["EventCard not found"] }, { status: 404 });

  return NextResponse.json({
    ...event,
    contentScore: event.contentScore
      ? contentScoreFromPersistence(event.contentScore)
      : scoreEventCard(event, event.sourceItems),
  });
}
