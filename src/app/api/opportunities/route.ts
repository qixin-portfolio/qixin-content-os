import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { contentScoreFromPersistence, scoreEventCard } from "@/lib/content/content-scorer";

export const runtime = "nodejs";

export async function GET() {
  const events = await getPrisma().eventCard.findMany({
    orderBy: { createdAt: "desc" },
    include: { project: true, sourceItems: true, contentScore: true, contentAngles: true },
  });

  return NextResponse.json(
    events.map((event) => ({
      ...event,
      contentScore: event.contentScore
        ? contentScoreFromPersistence(event.contentScore)
        : scoreEventCard(event, event.sourceItems),
    })),
  );
}
