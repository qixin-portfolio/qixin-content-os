import { NextResponse } from "next/server";
import { z } from "zod";
import { generateTopicPackage, withProviderFallback } from "@/lib/create/generation-service";
import { createGenerationProvider } from "@/lib/create/provider-factory";

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
    const provider = createGenerationProvider();
    const result = await withProviderFallback(provider, (activeProvider) => generateTopicPackage({
      provider: activeProvider,
      ...parsed.data,
    }));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      errors: [error instanceof Error ? error.message : "暂时没找到合适选题，请重试"],
    }, { status: 400 });
  }
}
