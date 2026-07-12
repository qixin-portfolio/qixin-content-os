import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

const createProjectSchema = z.object({
  name: z.string().min(1, "name is required"),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must use kebab-case"),
  description: z.string().min(1, "description is required"),
});

export async function GET() {
  const projects = await getPrisma().project.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  let raw: unknown;

  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ errors: ["Request body must be valid JSON"] }, { status: 400 });
  }

  const parsed = createProjectSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues.map((issue) => issue.message) },
      { status: 400 },
    );
  }

  try {
    const project = await getPrisma().project.create({ data: parsed.data });
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      return NextResponse.json({ errors: ["slug already exists"] }, { status: 409 });
    }

    return NextResponse.json({ errors: ["Project could not be created"] }, { status: 500 });
  }
}
