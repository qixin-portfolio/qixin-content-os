import { NextResponse } from "next/server";
import { runStyleReview } from "@/lib/editorial/revision-service";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const { draftId } = await params;
  try {
    const styleReview = await runStyleReview(getPrisma(), draftId);
    return NextResponse.json({ styleReview });
  } catch (error) {
    return NextResponse.json({ errors: [error instanceof Error ? error.message : "StyleReview failed"] }, { status: 400 });
  }
}
