import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { exportPublicationPackage } from "@/lib/publication/export-service";

export const runtime = "nodejs";

const exportSchema = z.object({ format: z.enum(["txt", "markdown", "json"]) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ packageId: string }> },
) {
  const { packageId } = await params;
  const parsed = exportSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ errors: ["format must be txt, markdown or json"] }, { status: 400 });
  }
  try {
    const result = await exportPublicationPackage(getPrisma(), packageId, parsed.data.format);
    const contentType = parsed.data.format === "json"
      ? "application/json; charset=utf-8"
      : parsed.data.format === "markdown"
        ? "text/markdown; charset=utf-8"
        : "text/plain; charset=utf-8";
    const encodedFileName = encodeURIComponent(result.fileName);
    return new NextResponse(result.content, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${result.fileName}"; filename*=UTF-8''${encodedFileName}`,
        "X-Publication-Export-Id": result.record.id,
        "X-Content-Hash": result.contentHash,
      },
    });
  } catch (error) {
    return NextResponse.json({
      errors: [error instanceof Error ? error.message : "Publication export failed"],
    }, { status: 400 });
  }
}
