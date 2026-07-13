import Database from "better-sqlite3";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  approveEditorialDraft,
  createHumanRevision,
  createInitialEditorialDraftRecord,
} from "../../src/lib/editorial/revision-service";

const migrationPaths = [
  "prisma/migrations/20260712110000_add_project_sources_and_traceability/migration.sql",
  "prisma/migrations/20260712120000_add_content_intelligence/migration.sql",
  "prisma/migrations/20260712130000_add_editorial_workbench/migration.sql",
  "prisma/migrations/20260713152000_add_approval_idempotency/migration.sql",
];

type TestContext = Awaited<ReturnType<typeof createTestContext>>;

async function createTestContext(label: string) {
  const suffix = randomUUID();
  const databasePath = join(tmpdir(), `qixin-content-os-approval-${label}-${suffix}.db`);
  const database = new Database(databasePath);
  for (const migrationPath of migrationPaths) {
    database.exec(readFileSync(migrationPath, "utf8"));
  }
  database.close();

  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databasePath }) });
  const project = await prisma.project.create({
    data: { name: `Approval ${label}`, slug: `approval-${label}-${suffix}` },
  });
  const event = await prisma.eventCard.create({
    data: {
      projectId: project.id,
      title: "批准幂等测试",
      whatHappened: "已整理一份项目资料。",
      whyItMatters: "需要保留事实边界。",
      problem: "当前缺少截图。",
      result: "只能确认文档已经形成。",
      personalReflection: "没完成的部分先写没完成。",
      evidenceRequired: "source-approval-test",
    },
  });
  const master = await prisma.masterContent.create({
    data: {
      eventCardId: event.id,
      title: "批准幂等测试",
      hook: "",
      story: "文档已经形成。",
      insight: "证据边界需要保留。",
      reflection: "没完成的部分先写没完成。",
      cta: "",
    },
  });
  const wechatVoice = await prisma.voiceProfile.create({
    data: {
      id: `voice-wechat-${suffix}`,
      name: "朋友圈测试声音",
      platform: "wechat_moments",
      tone: "真实",
      preferredWordsJson: "[]",
      avoidWordsJson: "[]",
      writingRulesJson: "[]",
      exampleTextsJson: "[]",
    },
  });
  const xVoice = await prisma.voiceProfile.create({
    data: {
      id: `voice-x-${suffix}`,
      name: "X 测试声音",
      platform: "x",
      tone: "真实",
      preferredWordsJson: "[]",
      avoidWordsJson: "[]",
      writingRulesJson: "[]",
      exampleTextsJson: "[]",
    },
  });
  const wechatDraft = await createInitialEditorialDraftRecord(
    prisma,
    master,
    "wechat_moments",
    wechatVoice.id,
  );
  const xDraft = await createInitialEditorialDraftRecord(prisma, master, "x", xVoice.id);
  const wechatSourceRevision = await createHumanRevision(prisma, wechatDraft.id, {
    title: "朋友圈人工稿",
    body: "朋友圈人工正文，事实边界保持不变。",
    hook: "",
    cta: "",
    changeSummary: "准备批准朋友圈稿",
  });
  const xSourceRevision = await createHumanRevision(prisma, xDraft.id, {
    title: "X 人工稿",
    body: "X 人工正文，事实边界保持不变。",
    hook: "",
    cta: "",
    changeSummary: "准备批准 X 稿",
  });

  return {
    prisma,
    databasePath,
    wechatDraftId: wechatDraft.id,
    xDraftId: xDraft.id,
    wechatSourceRevisionId: wechatSourceRevision.id,
    xSourceRevisionId: xSourceRevision.id,
  };
}

async function dispose(context: TestContext) {
  await context.prisma.$disconnect();
  rmSync(context.databasePath, { force: true });
}

describe("editorial approval idempotency", () => {
  it("creates one approval revision and one approved VoiceSample on first approval", async () => {
    const context = await createTestContext("first");
    try {
      const result = await approveEditorialDraft(context.prisma, context.wechatDraftId, {
        qualityRating: 5,
      });
      const approvals = await context.prisma.draftRevision.findMany({
        where: { editorialDraftId: context.wechatDraftId, changeSource: "human_approval" },
      });
      const samples = await context.prisma.voiceSample.findMany({
        where: { sourceType: "approved_draft", sourceReferenceId: context.wechatDraftId },
      });
      const source = await context.prisma.draftRevision.findUniqueOrThrow({
        where: { id: context.wechatSourceRevisionId },
      });

      expect(result.status).toBe("approved");
      expect(approvals).toHaveLength(1);
      expect(samples).toHaveLength(1);
      expect(approvals[0].approvedSourceRevisionId).toBe(source.id);
      expect(samples[0].sourceRevisionId).toBe(source.id);
      expect(approvals[0].body).toBe(source.body);
      expect(samples[0].body).toBe(source.body);
      expect(result.idempotent).toBe(false);

      await expect(context.prisma.draftRevision.create({
        data: {
          editorialDraftId: context.wechatDraftId,
          approvedSourceRevisionId: source.id,
          revisionNumber: 99,
          title: source.title,
          body: source.body,
          hook: source.hook,
          cta: source.cta,
          changeSource: "human_approval",
          changeSummary: "数据库唯一约束测试",
        },
      })).rejects.toMatchObject({ code: "P2002" });
      await expect(context.prisma.voiceSample.create({
        data: {
          voiceProfileId: samples[0].voiceProfileId,
          platform: samples[0].platform,
          title: samples[0].title,
          body: samples[0].body,
          sourceType: "approved_draft",
          sourceReferenceId: context.wechatDraftId,
          sourceRevisionId: source.id,
          qualityRating: 5,
          notes: "数据库唯一约束测试",
          approved: true,
          active: true,
        },
      })).rejects.toMatchObject({ code: "P2002" });
    } finally {
      await dispose(context);
    }
  });

  it("returns the first result without writing when the same source revision is approved twice", async () => {
    const context = await createTestContext("twice");
    try {
      const first = await approveEditorialDraft(context.prisma, context.wechatDraftId);
      const revisionCount = await context.prisma.draftRevision.count({
        where: { editorialDraftId: context.wechatDraftId },
      });
      const sampleCount = await context.prisma.voiceSample.count();
      const approvedAt = (await context.prisma.editorialDraft.findUniqueOrThrow({
        where: { id: context.wechatDraftId },
      })).approvedAt;

      const second = await approveEditorialDraft(context.prisma, context.wechatDraftId);
      const after = await context.prisma.editorialDraft.findUniqueOrThrow({
        where: { id: context.wechatDraftId },
      });

      expect(second.id).toBe(first.id);
      expect(second.idempotent).toBe(true);
      expect(await context.prisma.draftRevision.count({ where: { editorialDraftId: context.wechatDraftId } })).toBe(revisionCount);
      expect(await context.prisma.voiceSample.count()).toBe(sampleCount);
      expect(after.approvedAt?.toISOString()).toBe(approvedAt?.toISOString());
    } finally {
      await dispose(context);
    }
  });

  it("creates one approval result across five sequential calls", async () => {
    const context = await createTestContext("five");
    try {
      const results = [];
      for (let attempt = 0; attempt < 5; attempt += 1) {
        results.push(await approveEditorialDraft(context.prisma, context.wechatDraftId));
      }

      expect(new Set(results.map((result) => result.id)).size).toBe(1);
      expect(await context.prisma.draftRevision.count({
        where: { editorialDraftId: context.wechatDraftId, changeSource: "human_approval" },
      })).toBe(1);
      expect(await context.prisma.voiceSample.count({ where: { sourceType: "approved_draft" } })).toBe(1);
    } finally {
      await dispose(context);
    }
  });

  it("creates one approval result across two concurrent calls", async () => {
    const context = await createTestContext("concurrent");
    try {
      const [first, second] = await Promise.all([
        approveEditorialDraft(context.prisma, context.wechatDraftId),
        approveEditorialDraft(context.prisma, context.wechatDraftId),
      ]);

      expect(second.id).toBe(first.id);
      expect(await context.prisma.draftRevision.count({
        where: { editorialDraftId: context.wechatDraftId, changeSource: "human_approval" },
      })).toBe(1);
      expect(await context.prisma.voiceSample.count({ where: { sourceType: "approved_draft" } })).toBe(1);
    } finally {
      await dispose(context);
    }
  });

  it("returns an approved draft to editing after a new human revision", async () => {
    const context = await createTestContext("edit-after-approval");
    try {
      await approveEditorialDraft(context.prisma, context.wechatDraftId);
      const next = await createHumanRevision(context.prisma, context.wechatDraftId, {
        title: "批准后继续修改",
        body: "这是新的人工正文。",
        hook: "",
        cta: "",
        changeSummary: "批准后继续人工编辑",
      });
      const draft = await context.prisma.editorialDraft.findUniqueOrThrow({
        where: { id: context.wechatDraftId },
      });

      expect(next.changeSource).toBe("human_edit");
      expect(draft.status).toBe("editing");
      expect(draft.approvedAt).toBeNull();
    } finally {
      await dispose(context);
    }
  });

  it("allows a new human revision to create a new approval and VoiceSample", async () => {
    const context = await createTestContext("new-source");
    try {
      const first = await approveEditorialDraft(context.prisma, context.wechatDraftId);
      const nextSource = await createHumanRevision(context.prisma, context.wechatDraftId, {
        title: "第二个可批准版本",
        body: "第二个可批准正文。",
        hook: "",
        cta: "",
        changeSummary: "形成新的批准源版本",
      });
      const second = await approveEditorialDraft(context.prisma, context.wechatDraftId);

      expect(second.id).not.toBe(first.id);
      expect(nextSource.changeSource).toBe("human_edit");
      expect(await context.prisma.draftRevision.count({
        where: { editorialDraftId: context.wechatDraftId, changeSource: "human_approval" },
      })).toBe(2);
      expect(await context.prisma.voiceSample.count({ where: { sourceType: "approved_draft" } })).toBe(2);
    } finally {
      await dispose(context);
    }
  });

  it("approves different EditorialDraft records independently", async () => {
    const context = await createTestContext("independent");
    try {
      const [wechat, x] = await Promise.all([
        approveEditorialDraft(context.prisma, context.wechatDraftId),
        approveEditorialDraft(context.prisma, context.xDraftId),
      ]);

      expect(wechat.id).not.toBe(x.id);
      expect(await context.prisma.voiceSample.count({ where: { sourceReferenceId: context.wechatDraftId } })).toBe(1);
      expect(await context.prisma.voiceSample.count({ where: { sourceReferenceId: context.xDraftId } })).toBe(1);
    } finally {
      await dispose(context);
    }
  });

  it("rolls back the whole approval when VoiceSample creation fails", async () => {
    const context = await createTestContext("rollback");
    try {
      const before = await context.prisma.editorialDraft.findUniqueOrThrow({
        where: { id: context.wechatDraftId },
      });
      const revisionCount = await context.prisma.draftRevision.count({
        where: { editorialDraftId: context.wechatDraftId },
      });
      const reviewCount = await context.prisma.styleReview.count({
        where: { editorialDraftId: context.wechatDraftId },
      });
      await context.prisma.$executeRawUnsafe(`
        CREATE TRIGGER fail_approved_voice_sample
        BEFORE INSERT ON VoiceSample
        WHEN NEW.sourceType = 'approved_draft'
        BEGIN
          SELECT RAISE(ABORT, 'forced approved VoiceSample failure');
        END;
      `);

      await expect(approveEditorialDraft(context.prisma, context.wechatDraftId)).rejects.toThrow();
      const after = await context.prisma.editorialDraft.findUniqueOrThrow({
        where: { id: context.wechatDraftId },
      });

      expect(await context.prisma.draftRevision.count({ where: { editorialDraftId: context.wechatDraftId } })).toBe(revisionCount);
      expect(await context.prisma.styleReview.count({ where: { editorialDraftId: context.wechatDraftId } })).toBe(reviewCount);
      expect(await context.prisma.voiceSample.count()).toBe(0);
      expect(after.status).toBe(before.status);
      expect(after.approvedAt).toEqual(before.approvedAt);
      expect(after.currentRevisionId).toBe(before.currentRevisionId);
    } finally {
      await dispose(context);
    }
  });
});
