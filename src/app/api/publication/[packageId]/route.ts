import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { updateManualChecklist } from "@/lib/publication/checklist-service";
import { updatePublicationStatus } from "@/lib/publication/package-service";

export const runtime = "nodejs";

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update_checklist"),
    completedItemIds: z.array(z.string()),
  }),
  z.object({
    action: z.literal("set_status"),
    status: z.enum(["ready", "exported", "published", "archived"]),
    publishedAt: z.string().datetime().optional(),
    publishedUrl: z.string().optional(),
    publishNotes: z.string().optional(),
  }),
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ packageId: string }> },
) {
  const { packageId } = await params;
  const publicationPackage = await getPrisma().publicationPackage.findUnique({
    where: { id: packageId },
    include: {
      exports: { orderBy: { createdAt: "desc" } },
      editorialDraft: {
        include: {
          masterContent: { include: { eventCard: { include: { project: true } } } },
        },
      },
    },
  });
  if (!publicationPackage) {
    return NextResponse.json({ errors: ["Publication package not found"] }, { status: 404 });
  }
  return NextResponse.json({
    publicationPackage: {
      ...publicationPackage,
      evidenceSnapshot: JSON.parse(publicationPackage.evidenceSnapshotJson),
      factBoundary: JSON.parse(publicationPackage.factBoundaryJson),
      assetBrief: JSON.parse(publicationPackage.assetBriefJson),
      publishChecklist: JSON.parse(publicationPackage.publishChecklistJson),
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ packageId: string }> },
) {
  const { packageId } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ errors: ["Invalid publication package update"] }, { status: 400 });
  }
  try {
    const publicationPackage = parsed.data.action === "update_checklist"
      ? await updateManualChecklist(getPrisma(), packageId, parsed.data.completedItemIds)
      : await updatePublicationStatus(getPrisma(), packageId, {
        status: parsed.data.status,
        publishedAt: parsed.data.publishedAt ? new Date(parsed.data.publishedAt) : undefined,
        publishedUrl: parsed.data.publishedUrl,
        publishNotes: parsed.data.publishNotes,
      });
    return NextResponse.json({ publicationPackage });
  } catch (error) {
    return NextResponse.json({
      errors: [error instanceof Error ? error.message : "Publication package update failed"],
    }, { status: 400 });
  }
}
