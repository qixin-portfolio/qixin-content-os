import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { updateTopicCandidateStatus } from "@/lib/sources/obsidian/staging";

export const runtime = "nodejs";

const statusSchema = z.enum(["shortlisted", "rejected", "proposed"]);

export async function POST(request: Request, { params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params;
  const body = request.headers.get("content-type")?.includes("application/json")
    ? await request.json().catch(() => null)
    : Object.fromEntries((await request.formData()).entries());
  const status = statusSchema.safeParse(body && typeof body === "object" && "status" in body ? body.status : null);
  if (!status.success) return NextResponse.json({ errors: ["Unsupported status"] }, { status: 400 });
  try {
    const topic = await updateTopicCandidateStatus(getPrisma(), topicId, status.data);
    return request.headers.get("accept")?.includes("text/html") ? NextResponse.redirect(new URL(`/topics/${topic.id}`, request.url)) : NextResponse.json(topic);
  } catch (error) {
    return NextResponse.json({ errors: [error instanceof Error ? error.message : "Status update failed"] }, { status: 400 });
  }
}
