import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

const reviewSchema = z.object({
  researchWorthiness: z.enum(["yes", "no", ""]),
  firstHandEvidenceNeeded: z.string().max(2000),
  fitsCurrentProject: z.enum(["yes", "no", ""]),
  humanNotes: z.string().max(4000),
});

export async function POST(request: Request, { params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params;
  const toBoolean = (value: FormDataEntryValue | null) => value === "yes" ? true : value === "no" ? false : null;
  try {
    const form = await request.formData();
    const parsed = reviewSchema.safeParse(Object.fromEntries(form.entries()));
    if (!parsed.success) return NextResponse.json({ errors: ["Invalid review fields"] }, { status: 400 });
    await getPrisma().topicCandidate.update({
      where: { id: topicId },
      data: {
        researchWorthiness: toBoolean(parsed.data.researchWorthiness),
        firstHandEvidenceNeeded: parsed.data.firstHandEvidenceNeeded.trim() || null,
        fitsCurrentProject: toBoolean(parsed.data.fitsCurrentProject),
        humanNotes: parsed.data.humanNotes.trim() || null,
      },
    });
    return NextResponse.redirect(new URL(`/topics/${topicId}`, request.url), 303);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "P2025") return NextResponse.json({ errors: ["TopicCandidate not found"] }, { status: 404 });
    return NextResponse.json({ errors: ["Review update failed"] }, { status: 500 });
  }
}
