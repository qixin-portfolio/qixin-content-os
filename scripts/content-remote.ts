import { loadEnvConfig } from "@next/env";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  REMOTE_CONTENT_MODEL,
  createRemoteDrafts,
  createRemoteGenerationProvider,
  createRemoteTopics,
  loadRemoteVoiceStyleSummary,
} from "../src/lib/remote-content-bridge/service.ts";

loadEnvConfig(process.cwd());

async function readJson() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) throw new Error("需要 stdin JSON 输入。");
  return JSON.parse(text) as unknown;
}

function write(value: unknown) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "远程内容生成暂不可用。";
  return { status: "error", error: message.replace(/(?:sk-|Bearer\s+)[^\s]+/giu, "[redacted]") };
}

function gatewayConfigured() {
  const home = process.env.HERMES_HOME?.trim() || join(homedir(), ".hermes");
  const runtimePath = join(home, "data", "qixin-content-bridge", "runtime.json");
  try {
    const runtime = JSON.parse(readFileSync(runtimePath, "utf8")) as { allowedChatIdHash?: unknown };
    return Boolean(typeof runtime.allowedChatIdHash === "string" && runtime.allowedChatIdHash);
  } catch {
    return false;
  }
}

async function main() {
  const command = process.argv[2];
  if (command === "health") {
    const provider = createRemoteGenerationProvider();
    const gateway = gatewayConfigured() ? "configured" : "not_configured";
    write({
      status: gateway === "configured" ? "ok" : "error",
      gateway,
      provider: provider.id === "volcengine_ark" ? "configured" : "not_configured",
      model: REMOTE_CONTENT_MODEL,
      databaseWrites: false,
    });
    if (gateway !== "configured") process.exitCode = 1;
    return;
  }

  const input = await readJson();
  const provider = createRemoteGenerationProvider();
  const voiceStyleSummary = await loadRemoteVoiceStyleSummary();
  if (command === "topics") {
    write(await createRemoteTopics(input, { provider, voiceStyleSummary }));
    return;
  }
  if (command === "drafts") {
    write(await createRemoteDrafts(input, { provider, voiceStyleSummary }));
    return;
  }
  throw new Error("只支持 topics、drafts 或 health。");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "remote content bridge failed");
  write(safeError(error));
  process.exitCode = 1;
});
