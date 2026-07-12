import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { importMarkdown } from "@/lib/importers/markdown";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const projectId = formData.get("projectId");
  const file = formData.get("file");

  if (typeof projectId !== "string" || !projectId) {
    return NextResponse.json({ errors: ["projectId is required"] }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ errors: ["A Markdown file is required"] }, { status: 400 });
  }

  if (!/\.(md|markdown)$/i.test(file.name)) {
    return NextResponse.json({ errors: ["Only .md or .markdown files are supported"] }, { status: 400 });
  }

  const project = await getPrisma().project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) {
    return NextResponse.json({ errors: ["Project not found"] }, { status: 404 });
  }

  const draft = importMarkdown(await file.text());
  const projectSource = await getPrisma().projectSource.create({
    data: {
      projectId,
      sourceType: draft.sourceType,
      sourceName: draft.title,
      sourcePath: file.name,
      metadataJson: JSON.stringify({ fileName: file.name, contentType: file.type || "text/markdown" }),
      sourceItems: {
        create: {
          projectId,
          sourceType: draft.sourceType,
          title: draft.title,
          content: draft.content,
          sourcePath: file.name,
          visibility: "private",
        },
      },
    },
    include: { sourceItems: true },
  });

  return NextResponse.json(
    { projectSource, sourceItem: projectSource.sourceItems[0] },
    { status: 201 },
  );
}
