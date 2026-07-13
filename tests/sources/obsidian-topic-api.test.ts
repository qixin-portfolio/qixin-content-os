import Database from "better-sqlite3";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { updateTopicCandidateStatus } from "../../src/lib/sources/obsidian/staging";

const prismaState = vi.hoisted(() => ({ value: undefined as PrismaClient | undefined }));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => {
    if (!prismaState.value) throw new Error("Topic API test PrismaClient is not initialized");
    return prismaState.value;
  },
}));

vi.mock("@/lib/sources/obsidian/staging", async () => (
  import("../../src/lib/sources/obsidian/staging")
));

import { POST as reviewTopic } from "../../src/app/api/topics/[topicId]/review/route";
import { POST as changeTopicStatus } from "../../src/app/api/topics/[topicId]/status/route";

const databasePath = join(tmpdir(), `qixin-topic-api-${randomUUID()}.db`);

describe("TopicCandidate review APIs", () => {
  let prisma: PrismaClient;
  let projectId = "";

  beforeAll(async () => {
    const database = new Database(databasePath);
    for (const migration of ["20260712110000_add_project_sources_and_traceability", "20260712120000_add_content_intelligence", "20260712130000_add_editorial_workbench", "20260713152000_add_approval_idempotency", "20260713170000_add_publication_packages", "20260714090000_add_phase6a_obsidian_research"]) {
      database.exec(readFileSync(`prisma/migrations/${migration}/migration.sql`, "utf8"));
    }
    database.close();
    prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databasePath }) });
    prismaState.value = prisma;
    projectId = (await prisma.project.create({ data: { name: "Topic API", slug: `topic-api-${randomUUID()}` } })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    prismaState.value = undefined;
    rmSync(databasePath, { force: true });
  });

  it("uses 303 after a valid human review and rejects invalid partial input", async () => {
    const topic = await createTopic(prisma, projectId, "人工审核");
    const valid = await reviewTopic(new Request(`http://localhost/api/topics/${topic.id}/review`, { method: "POST", body: new URLSearchParams({ researchWorthiness: "yes", firstHandEvidenceNeeded: "补本地访谈", fitsCurrentProject: "yes", humanNotes: "继续研究" }) }), { params: Promise.resolve({ topicId: topic.id }) });
    expect(valid.status).toBe(303);
    expect(valid.headers.get("location")).toBe(`http://localhost/topics/${topic.id}`);

    const invalid = await reviewTopic(new Request(`http://localhost/api/topics/${topic.id}/review`, { method: "POST", body: new URLSearchParams({ humanNotes: "不完整" }) }), { params: Promise.resolve({ topicId: topic.id }) });
    expect(invalid.status).toBe(400);
    expect((await prisma.topicCandidate.findUniqueOrThrow({ where: { id: topic.id } })).researchWorthiness).toBe(true);
  });

  it("uses 303 for HTML status forms and returns a stable conflict response", async () => {
    const topic = await createTopic(prisma, projectId, "状态表单");
    const response = await changeTopicStatus(new Request(`http://localhost/api/topics/${topic.id}/status`, { method: "POST", headers: { accept: "text/html" }, body: new URLSearchParams({ status: "shortlisted" }) }), { params: Promise.resolve({ topicId: topic.id }) });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`http://localhost/topics/${topic.id}`);
    const conflict = await changeTopicStatus(new Request(`http://localhost/api/topics/${topic.id}/status`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "rejected" }) }), { params: Promise.resolve({ topicId: topic.id }) });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ errors: ["TopicCandidate status conflict"] });
  });

  it("allows only one concurrent transition from proposed", async () => {
    const topic = await createTopic(prisma, projectId, "并发状态");
    const results = await Promise.allSettled([
      updateTopicCandidateStatus(prisma, topic.id, "shortlisted"),
      updateTopicCandidateStatus(prisma, topic.id, "rejected"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });
});

function createTopic(prisma: PrismaClient, projectId: string, title: string) {
  return prisma.topicCandidate.create({ data: { projectId, title, targetAudience: "运营", userPainPoint: "缺证据", coreAngle: "人工判断", evidenceStrength: "weak", freshness: "中", suggestedPlatformsJson: "[]", riskFlagsJson: "[]", status: "proposed" } });
}
