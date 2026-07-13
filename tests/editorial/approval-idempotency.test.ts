import Database from "better-sqlite3";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  approveEditorialDraft,
  createHumanRevision,
  createInitialEditorialDraftRecord,
  createSuggestionRevision,
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

type IsolatedApprovalResult = {
  ok: boolean;
  result?: {
    approvalRevisionId: string;
    voiceSampleId: string;
    sourceRevisionId: string;
    idempotent: boolean;
  };
  error?: { code?: string; message: string };
};

function approveFromIsolatedProcess(
  databasePath: string,
  editorialDraftId: string,
  startAt: number,
): Promise<IsolatedApprovalResult> {
  const revisionServiceUrl = pathToFileURL(
    join(process.cwd(), "src/lib/editorial/revision-service.ts"),
  ).href;
  const script = `
    import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
    import { PrismaClient } from "@prisma/client";
    import { approveEditorialDraft } from ${JSON.stringify(revisionServiceUrl)};
    const [databasePath, editorialDraftId, startAtValue] = process.argv.slice(1);
    const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databasePath }) });
    const waitMs = Math.max(0, Number(startAtValue) - Date.now());
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    try {
      const result = await approveEditorialDraft(prisma, editorialDraftId);
      process.stdout.write(JSON.stringify({
        ok: true,
        result: {
          approvalRevisionId: result.approvalRevisionId,
          voiceSampleId: result.voiceSampleId,
          sourceRevisionId: result.sourceRevisionId,
          idempotent: result.idempotent,
        },
      }));
    } catch (error) {
      process.stdout.write(JSON.stringify({
        ok: false,
        error: {
          code: error && typeof error === "object" && "code" in error ? String(error.code) : undefined,
          message: error instanceof Error ? error.message : "Unknown approval error",
        },
      }));
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  `;

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      script,
      databasePath,
      editorialDraftId,
      String(startAt),
    ], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", () => {
      try {
        resolve(JSON.parse(stdout) as IsolatedApprovalResult);
      } catch {
        reject(new Error(`Isolated approval returned invalid output: ${stderr || stdout}`));
      }
    });
  });
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
      expect(result.approvalRevisionId).toBe(approvals[0].id);
      expect(result.voiceSampleId).toBe(samples[0].id);
      expect(result.sourceRevisionId).toBe(source.id);

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

      const nullableRevisions = await context.prisma.draftRevision.findMany({
        where: {
          editorialDraftId: context.wechatDraftId,
          changeSource: { in: ["ai_initial", "human_edit"] },
        },
      });
      expect(nullableRevisions.length).toBeGreaterThan(1);
      expect(nullableRevisions.every((revision) => revision.approvedSourceRevisionId === null)).toBe(true);
      await context.prisma.voiceSample.createMany({
        data: [
          {
            voiceProfileId: samples[0].voiceProfileId,
            platform: "wechat_moments",
            title: "导入样本一",
            body: "导入样本一正文",
            sourceType: "imported_post",
            sourceReferenceId: "import-null-one",
            sourceRevisionId: null,
            qualityRating: 4,
            notes: "SQLite NULL 唯一值测试",
          },
          {
            voiceProfileId: samples[0].voiceProfileId,
            platform: "wechat_moments",
            title: "导入样本二",
            body: "导入样本二正文",
            sourceType: "imported_post",
            sourceReferenceId: "import-null-two",
            sourceRevisionId: null,
            qualityRating: 4,
            notes: "SQLite NULL 唯一值测试",
          },
        ],
      });
      expect(await context.prisma.voiceSample.count({
        where: { sourceType: "imported_post", sourceRevisionId: null },
      })).toBe(2);
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
      expect(second.approvalRevisionId).toBe(first.approvalRevisionId);
      expect(second.voiceSampleId).toBe(first.voiceSampleId);
      expect(second.sourceRevisionId).toBe(first.sourceRevisionId);
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
      expect(new Set(results.map((result) => result.approvalRevisionId)).size).toBe(1);
      expect(new Set(results.map((result) => result.voiceSampleId)).size).toBe(1);
      expect(new Set(results.map((result) => result.sourceRevisionId)).size).toBe(1);
      expect(results.map((result) => result.idempotent)).toEqual([false, true, true, true, true]);
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

  it("uses database uniqueness across isolated processes without a shared memory lock", async () => {
    const context = await createTestContext("cross-process");
    try {
      const startAt = Date.now() + 500;
      const [first, second] = await Promise.all([
        approveFromIsolatedProcess(context.databasePath, context.wechatDraftId, startAt),
        approveFromIsolatedProcess(context.databasePath, context.wechatDraftId, startAt),
      ]);

      expect(first, JSON.stringify(first)).toMatchObject({ ok: true });
      expect(second, JSON.stringify(second)).toMatchObject({ ok: true });
      expect(second.result?.approvalRevisionId).toBe(first.result?.approvalRevisionId);
      expect(second.result?.voiceSampleId).toBe(first.result?.voiceSampleId);
      expect(second.result?.sourceRevisionId).toBe(first.result?.sourceRevisionId);
      expect([first.result?.idempotent, second.result?.idempotent].sort()).toEqual([false, true]);
      expect(await context.prisma.draftRevision.count({
        where: { editorialDraftId: context.wechatDraftId, changeSource: "human_approval" },
      })).toBe(1);
      expect(await context.prisma.voiceSample.count({ where: { sourceType: "approved_draft" } })).toBe(1);
    } finally {
      await dispose(context);
    }
  }, 15_000);

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

  it("binds approval products to an ai_suggestion source without modifying the source", async () => {
    const context = await createTestContext("suggestion-source");
    try {
      const suggestion = await createSuggestionRevision(context.prisma, context.wechatDraftId, {
        title: "人工采用的建议稿",
        body: "建议稿正文仍保留事实边界。",
        hook: "",
        cta: "",
        changeSummary: "人工采用建议形成新源版本",
      });
      const result = await approveEditorialDraft(context.prisma, context.wechatDraftId);
      const approval = await context.prisma.draftRevision.findUniqueOrThrow({
        where: { id: result.approvalRevisionId },
      });
      const sample = await context.prisma.voiceSample.findUniqueOrThrow({
        where: { id: result.voiceSampleId },
      });

      expect(suggestion.changeSource).toBe("ai_suggestion");
      expect(suggestion.approvedSourceRevisionId).toBeNull();
      expect(approval.approvedSourceRevisionId).toBe(suggestion.id);
      expect(sample.sourceRevisionId).toBe(suggestion.id);
      expect(approval.approvedSourceRevisionId).not.toBe(approval.id);
    } finally {
      await dispose(context);
    }
  });

  it("allows a new human revision to create a new approval and VoiceSample", async () => {
    const context = await createTestContext("new-source");
    try {
      const first = await approveEditorialDraft(context.prisma, context.wechatDraftId);
      const firstReplay = await approveEditorialDraft(context.prisma, context.wechatDraftId);
      const nextSource = await createHumanRevision(context.prisma, context.wechatDraftId, {
        title: "第二个可批准版本",
        body: "第二个可批准正文。",
        hook: "",
        cta: "",
        changeSummary: "形成新的批准源版本",
      });
      const second = await approveEditorialDraft(context.prisma, context.wechatDraftId);
      const secondReplay = await approveEditorialDraft(context.prisma, context.wechatDraftId);

      expect(second.id).not.toBe(first.id);
      expect(firstReplay.approvalRevisionId).toBe(first.approvalRevisionId);
      expect(firstReplay.voiceSampleId).toBe(first.voiceSampleId);
      expect(firstReplay.sourceRevisionId).toBe(first.sourceRevisionId);
      expect(secondReplay.approvalRevisionId).toBe(second.approvalRevisionId);
      expect(secondReplay.voiceSampleId).toBe(second.voiceSampleId);
      expect(secondReplay.sourceRevisionId).toBe(second.sourceRevisionId);
      expect(first.sourceRevisionId).not.toBe(second.sourceRevisionId);
      expect(first.approvalRevisionId).not.toBe(second.approvalRevisionId);
      expect(first.voiceSampleId).not.toBe(second.voiceSampleId);
      expect(second.sourceRevisionId).toBe(nextSource.id);
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

  it.each([
    {
      label: "StyleReview insert",
      trigger: `
        CREATE TRIGGER fail_style_review
        BEFORE INSERT ON StyleReview
        BEGIN
          SELECT RAISE(ABORT, 'forced StyleReview failure');
        END;
      `,
    },
    {
      label: "approval Revision insert",
      trigger: `
        CREATE TRIGGER fail_approval_revision
        BEFORE INSERT ON DraftRevision
        WHEN NEW.changeSource = 'human_approval'
        BEGIN
          SELECT RAISE(ABORT, 'forced approval Revision failure');
        END;
      `,
    },
    {
      label: "EditorialDraft approval update",
      trigger: `
        CREATE TRIGGER fail_draft_approval
        BEFORE UPDATE ON EditorialDraft
        WHEN NEW.status = 'approved'
        BEGIN
          SELECT RAISE(ABORT, 'forced EditorialDraft approval failure');
        END;
      `,
    },
    {
      label: "approved VoiceSample insert",
      trigger: `
        CREATE TRIGGER fail_approved_voice_sample
        BEFORE INSERT ON VoiceSample
        WHEN NEW.sourceType = 'approved_draft'
        BEGIN
          SELECT RAISE(ABORT, 'forced approved VoiceSample failure');
        END;
      `,
    },
  ])("rolls back the whole transaction when $label fails", async ({ label, trigger }) => {
    const context = await createTestContext(`rollback-${label.replaceAll(" ", "-")}`);
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
      await context.prisma.$executeRawUnsafe(trigger);

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
