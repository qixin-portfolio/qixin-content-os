import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

const updateSchema = z.object({
  qualityRating: z.number().int().min(1).max(5).optional(),
  notes: z.string().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ errors: ["Invalid VoiceSample update"] }, { status: 400 });
  try {
    const sample = await getPrisma().voiceSample.update({ where: { id }, data: parsed.data });
    return NextResponse.json(sample);
  } catch {
    return NextResponse.json({ errors: ["VoiceSample not found"] }, { status: 404 });
  }
}
