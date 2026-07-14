import { NextResponse } from "next/server";
import { z } from "zod";
import { generateCreateTopics } from "@/lib/create/topic-generator";

export const runtime = "nodejs";

const inputSchema = z.object({
  sourceMode: z.enum(["manual", "project", "x"]),
  sourceText: z.string(),
  platform: z.literal("wechat_moments"),
});

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parsed.data.sourceText.trim()) {
    return NextResponse.json({ errors: ["请先写下一句话，或选择一个最近项目"] }, { status: 400 });
  }
  try {
    return NextResponse.json({ topics: generateCreateTopics(parsed.data) });
  } catch (error) {
    return NextResponse.json({
      errors: [error instanceof Error ? error.message : "暂时没找到合适选题，请重试"],
    }, { status: 400 });
  }
}
