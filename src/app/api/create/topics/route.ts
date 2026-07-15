import { NextResponse } from "next/server";
import { z } from "zod";
import { generateTopicPackage } from "@/lib/create/generation-service";
import { createGenerationProvider } from "@/lib/create/provider-factory";
import { createProviderHttpStatus, isCreateProviderError, LocalFallbackProvider } from "@/lib/create/provider";

export const runtime = "nodejs";
export const maxDuration = 150;

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
    const provider = request.headers.get("x-use-local-demo") === "true"
      ? new LocalFallbackProvider()
      : createGenerationProvider();
    const result = await generateTopicPackage({
      provider,
      ...parsed.data,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (isCreateProviderError(error)) {
      return NextResponse.json({
        errors: [error.message],
        classification: error.code,
        fallback: false,
        localFallbackAvailable: true,
      }, { status: createProviderHttpStatus(error) });
    }
    return NextResponse.json({
      errors: [error instanceof Error ? error.message : "暂时没找到合适选题，请重试"],
    }, { status: 400 });
  }
}
