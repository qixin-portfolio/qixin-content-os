import { NextResponse } from "next/server";
import { z } from "zod";
import { factCheck } from "@/lib/content/fact-check";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

const createEventSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  title: z.string().min(1, "title is required"),
  whatHappened: z.string().min(1, "whatHappened is required"),
  whyItMatters: z.string().min(1, "whyItMatters is required"),
  problem: z.string().min(1, "problem is required"),
  result: z.string().min(1, "result is required"),
  personalReflection: z.string().min(1, "personalReflection is required"),
  evidenceRequired: z.string().min(1, "evidenceRequired is required"),
  sourceItemIds: z.array(z.string().min(1)).min(1, "sourceItemIds is required"),
});

export async function GET() {
  const events = await getPrisma().eventCard.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      projectId: true,
      title: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json(events);
}

export async function POST(request: Request) {
  let raw: Record<string, unknown>;

  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ errors: ["Request body must be valid JSON"] }, { status: 400 });
  }

  const factResult = factCheck({
    evidenceRequired:
      typeof raw.evidenceRequired === "string" ? raw.evidenceRequired : undefined,
    result: typeof raw.result === "string" ? raw.result : undefined,
    personalReflection:
      typeof raw.personalReflection === "string" ? raw.personalReflection : undefined,
  });

  if (!factResult.valid) {
    return NextResponse.json({ errors: factResult.errors }, { status: 400 });
  }

  const parsed = createEventSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues.map((issue) => issue.message) },
      { status: 400 },
    );
  }

  const { sourceItemIds, ...eventData } = parsed.data;
  const sourceItems = await getPrisma().sourceItem.findMany({
    where: { id: { in: sourceItemIds } },
    select: { id: true, projectId: true },
  });

  if (
    sourceItems.length !== sourceItemIds.length ||
    sourceItems.some((sourceItem) => sourceItem.projectId !== eventData.projectId)
  ) {
    return NextResponse.json(
      { errors: ["All sourceItemIds must exist and belong to projectId"] },
      { status: 400 },
    );
  }

  const event = await getPrisma().eventCard.create({
    data: {
      ...eventData,
      status: "inbox",
      sourceItems: { connect: sourceItemIds.map((id) => ({ id })) },
    },
  });

  return NextResponse.json(event, { status: 201 });
}
