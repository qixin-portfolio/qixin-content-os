import { NextResponse } from "next/server";
import { z } from "zod";
import { approveEditorialDraft } from "@/lib/editorial/revision-service";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

const approvalSchema = z.object({
  overrideReason: z.string().optional(),
  qualityRating: z.number().int().min(1).max(5).optional(),
  notes: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const { draftId } = await params;
  const parsed = approvalSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ errors: ["Invalid approval input"] }, { status: 400 });
  try {
    const result = await approveEditorialDraft(getPrisma(), draftId, parsed.data);
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ errors: [error instanceof Error ? error.message : "Approval failed"] }, { status: 400 });
  }
}
