import { NextResponse } from "next/server";
import { z } from "zod";
import { rejectEditorialDraft } from "@/lib/editorial/revision-service";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

const rejectSchema = z.object({ reason: z.string().min(1) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const { draftId } = await params;
  const parsed = rejectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ errors: ["reason is required"] }, { status: 400 });
  try {
    const draft = await rejectEditorialDraft(getPrisma(), draftId, parsed.data.reason);
    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json({ errors: [error instanceof Error ? error.message : "Rejection failed"] }, { status: 400 });
  }
}
