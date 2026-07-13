import Database from "better-sqlite3";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHumanRevision, createInitialEditorialDraftRecord } from "../../src/lib/editorial/revision-service";

const prismaState = vi.hoisted(() => ({ value: undefined as PrismaClient | undefined }));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => {
    if (!prismaState.value) throw new Error("Approval API test PrismaClient is not initialized");
    return prismaState.value;
  },
}));

vi.mock("@/lib/editorial/revision-service", async () => (
  import("../../src/lib/editorial/revision-service")
));

import { POST } from "../../src/app/api/editorial/[draftId]/approve/route";

const databasePath = join(tmpdir(), `qixin-content-os-approval-api-${randomUUID()}.db`);
const migrationPaths = [
  "prisma/migrations/20260712110000_add_project_sources_and_traceability/migration.sql",
  "prisma/migrations/20260712120000_add_content_intelligence/migration.sql",
  "prisma/migrations/20260712130000_add_editorial_workbench/migration.sql",
  "prisma/migrations/20260713152000_add_approval_idempotency/migration.sql",
];

describe("editorial approval API idempotency", () => {
  let prisma: PrismaClient;
  let editorialDraftId = "";
  let sourceRevisionId = "";

  beforeAll(async () => {
    const database = new Database(databasePath);
    for (const migrationPath of migrationPaths) {
      database.exec(readFileSync(migrationPath, "utf8"));
    }
    database.close();

    prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databasePath }) });
    prismaState.value = prisma;
    const suffix = randomUUID();
    const project = await prisma.project.create({
      data: { name: "Approval API test", slug: `approval-api-${suffix}` },
    });
    const event = await prisma.eventCard.create({
      data: {
        projectId: project.id,
        title: "批准 API 幂等测试",
        whatHappened: "已整理测试资料。",
        whyItMatters: "需要验证 HTTP 幂等语义。",
        problem: "不能重复生成批准产物。",
        result: "仅验证临时测试数据。",
        personalReflection: "先验证再冻结。",
        evidenceRequired: "source-approval-api-test",
      },
    });
    const master = await prisma.masterContent.create({
      data: {
        eventCardId: event.id,
        title: "批准 API 幂等测试",
        hook: "",
        story: "已整理测试资料。",
        insight: "批准必须幂等。",
        reflection: "先验证再冻结。",
        cta: "",
      },
    });
    const voice = await prisma.voiceProfile.create({
      data: {
        id: `voice-approval-api-${suffix}`,
        name: "批准 API 测试声音",
        platform: "wechat_moments",
        tone: "真实",
        preferredWordsJson: "[]",
        avoidWordsJson: "[]",
        writingRulesJson: "[]",
        exampleTextsJson: "[]",
      },
    });
    const draft = await createInitialEditorialDraftRecord(
      prisma,
      master,
      "wechat_moments",
      voice.id,
    );
    editorialDraftId = draft.id;
    sourceRevisionId = (await createHumanRevision(prisma, draft.id, {
      title: "批准 API 人工稿",
      body: "批准 API 人工正文。",
      hook: "",
      cta: "",
      changeSummary: "准备验证批准 API",
    })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    prismaState.value = undefined;
    rmSync(databasePath, { force: true });
  });

  it("returns 201 once and stable 200 idempotent results on four replays", async () => {
    const responses = [];
    const payloads: Array<{ result: {
      approvalRevisionId: string;
      voiceSampleId: string;
      sourceRevisionId: string;
      idempotent: boolean;
    } }> = [];
    let firstApprovedAt = "";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await POST(
        new Request("http://localhost/api/editorial/approval-test/approve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }),
        { params: Promise.resolve({ draftId: editorialDraftId }) },
      );
      responses.push(response);
      payloads.push(await response.json());
      const approvedAt = (await prisma.editorialDraft.findUniqueOrThrow({
        where: { id: editorialDraftId },
      })).approvedAt?.toISOString() ?? "";
      if (attempt === 0) firstApprovedAt = approvedAt;
      expect(approvedAt).toBe(firstApprovedAt);
    }

    expect(responses.map((response) => response.status)).toEqual([201, 200, 200, 200, 200]);
    expect(payloads.map(({ result }) => result.idempotent)).toEqual([false, true, true, true, true]);
    expect(new Set(payloads.map(({ result }) => result.approvalRevisionId)).size).toBe(1);
    expect(new Set(payloads.map(({ result }) => result.voiceSampleId)).size).toBe(1);
    expect(new Set(payloads.map(({ result }) => result.sourceRevisionId))).toEqual(new Set([sourceRevisionId]));
    expect(await prisma.draftRevision.count({
      where: { editorialDraftId, changeSource: "human_approval" },
    })).toBe(1);
    expect(await prisma.voiceSample.count({ where: { sourceRevisionId } })).toBe(1);
  });
});
