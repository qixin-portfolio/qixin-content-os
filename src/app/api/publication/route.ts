import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { createPublicationPackage } from "@/lib/publication/package-service";

export const runtime = "nodejs";

const createSchema = z.object({ editorialDraftId: z.string().min(1) });

export async function GET() {
  const packages = await getPrisma().publicationPackage.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { exports: true } },
      editorialDraft: {
        include: {
          masterContent: { include: { eventCard: { include: { project: true } } } },
        },
      },
    },
  });
  return NextResponse.json({ packages });
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ errors: ["editorialDraftId is required"] }, { status: 400 });
  }
  try {
    const result = await createPublicationPackage(
      getPrisma(),
      parsed.data.editorialDraftId,
    );
    return NextResponse.json({ result }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({
      errors: [error instanceof Error ? error.message : "Publication package creation failed"],
    }, { status: 400 });
  }
}
