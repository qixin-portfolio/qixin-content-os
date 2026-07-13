import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params;
  const form = await request.formData();
  const toBoolean = (value: FormDataEntryValue | null) => value === "yes" ? true : value === "no" ? false : null;
  try {
    await getPrisma().topicCandidate.update({
      where: { id: topicId },
      data: {
        researchWorthiness: toBoolean(form.get("researchWorthiness")),
        firstHandEvidenceNeeded: String(form.get("firstHandEvidenceNeeded") ?? "").trim() || null,
        fitsCurrentProject: toBoolean(form.get("fitsCurrentProject")),
        humanNotes: String(form.get("humanNotes") ?? "").trim() || null,
      },
    });
    return NextResponse.redirect(new URL(`/topics/${topicId}`, request.url));
  } catch (error) {
    return NextResponse.json({ errors: [error instanceof Error ? error.message : "Review update failed"] }, { status: 400 });
  }
}
