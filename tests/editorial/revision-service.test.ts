import Database from "better-sqlite3";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approveEditorialDraft,
  createHumanRevision,
  createInitialEditorialDraft,
  createInitialEditorialDraftRecord,
  createSuggestionRevision,
  rejectEditorialDraft,
} from "../../src/lib/editorial/revision-service";

const databasePath = join(tmpdir(), `qixin-content-os-editorial-${process.pid}.db`);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databasePath }) });

describe("editorial revision service", () => {
  let masterContentId = "";
  let wechatDraftId = "";
  let xDraftId = "";

  beforeAll(async () => {
    const database = new Database(databasePath);
    database.exec(readFileSync("prisma/migrations/20260712110000_add_project_sources_and_traceability/migration.sql", "utf8"));
    database.exec(readFileSync("prisma/migrations/20260712120000_add_content_intelligence/migration.sql", "utf8"));
    database.exec(readFileSync("prisma/migrations/20260712130000_add_editorial_workbench/migration.sql", "utf8"));
    database.exec(readFileSync("prisma/migrations/20260713152000_add_approval_idempotency/migration.sql", "utf8"));
    database.close();

    const project = await prisma.project.create({ data: { name: "Editorial test", slug: `editorial-test-${process.pid}` } });
    const event = await prisma.eventCard.create({
      data: {
        projectId: project.id,
        title: "资料整理",
        whatHappened: "已整理一份项目资料。",
        whyItMatters: "需要保留证据边界。",
        problem: "当前缺少截图。",
        result: "只能确认文档已形成。",
        personalReflection: "先把证据缺口写清楚。",
        evidenceRequired: "source-editorial",
      },
    });
    const master = await prisma.masterContent.create({
      data: {
        eventCardId: event.id,
        title: "资料整理",
        hook: "从一次资料整理开始。",
        story: "文档已形成。",
        insight: "证据边界要先写清楚。",
        reflection: "先保留缺口。",
        cta: "",
      },
    });
    masterContentId = master.id;

    const voice = await prisma.voiceProfile.create({
      data: {
        id: "voice-editorial-test",
        name: "测试声音",
        platform: "wechat_moments",
        tone: "真实",
        preferredWordsJson: "[]",
        avoidWordsJson: "[]",
        writingRulesJson: "[]",
        exampleTextsJson: "[]",
      },
    });
    wechatDraftId = (await createInitialEditorialDraftRecord(prisma, master, "wechat_moments", voice.id)).id;
    xDraftId = (await createInitialEditorialDraftRecord(prisma, master, "x", voice.id)).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    rmSync(databasePath, { force: true });
  });

  it("keeps the original MasterContent unchanged while creating revisions", async () => {
    const before = await prisma.masterContent.findUniqueOrThrow({ where: { id: masterContentId } });
    const revision = await createHumanRevision(prisma, wechatDraftId, {
      title: "人工编辑后的标题",
      body: "人工编辑后的正文。",
      hook: "",
      cta: "",
      changeSummary: "删掉模板化开头",
    });
    const after = await prisma.masterContent.findUniqueOrThrow({ where: { id: masterContentId } });

    expect(revision.revisionNumber).toBe(2);
    expect(after.title).toBe(before.title);
    expect(after.story).toBe(before.story);
  });

  it("does not duplicate a reflection already contained in the insight", () => {
    const content = createInitialEditorialDraft({
      id: "master-dedupe",
      eventCardId: "event-dedupe",
      title: "资料整理",
      hook: "",
      story: "文档已形成。",
      insight: "先保留证据缺口，比把规划写成结果更重要。",
      reflection: "先保留证据缺口，比把规划写成结果更重要。",
      cta: "",
      status: "drafting",
    }, "wechat_moments");

    expect(content.body.match(/先保留证据缺口/g)).toHaveLength(1);
  });

  it("increments revisions and never lets a suggestion silently replace content", async () => {
    const suggestion = await createSuggestionRevision(prisma, wechatDraftId, {
      title: "建议标题",
      body: "建议正文。",
      hook: "",
      cta: "",
      changeSummary: "人工点击采用建议",
    });
    const draft = await prisma.editorialDraft.findUniqueOrThrow({ where: { id: wechatDraftId } });

    expect(suggestion.revisionNumber).toBe(3);
    expect(suggestion.approvedSourceRevisionId).toBeNull();
    expect(draft.title).toBe("建议标题");
    expect(draft.currentRevisionId).toBe(suggestion.id);
  });

  it("keeps platform revision histories isolated", async () => {
    const wechatRevisions = await prisma.draftRevision.count({ where: { editorialDraftId: wechatDraftId } });
    const xRevisions = await prisma.draftRevision.count({ where: { editorialDraftId: xDraftId } });

    expect(wechatRevisions).toBe(3);
    expect(xRevisions).toBe(1);
  });

  it("requires a passing style review or an explicit override before approval", async () => {
    await createHumanRevision(prisma, wechatDraftId, {
      title: "重磅更新！",
      body: "这不仅仅是一次记录，更是彻底改变。",
      hook: "你有没有发现，在这个时代一定要赋能自己！！！",
      cta: "赶紧收藏，私信我领取。",
      changeSummary: "测试低分稿件的批准门槛",
    });
    await expect(approveEditorialDraft(prisma, wechatDraftId)).rejects.toThrow("70");
    await expect(approveEditorialDraft(prisma, wechatDraftId, { overrideReason: "人工确认事实边界" })).resolves.toMatchObject({ status: "approved" });

    const sample = await prisma.voiceSample.findFirstOrThrow({ where: { sourceReferenceId: wechatDraftId } });
    expect(sample.sourceType).toBe("approved_draft");
    expect(sample.approved).toBe(true);
  });

  it("returns an approved draft to editing when it is changed again", async () => {
    await createHumanRevision(prisma, wechatDraftId, {
      title: "批准后的人工修改",
      body: "批准后仍需人工修改的正文。",
      hook: "",
      cta: "",
      changeSummary: "批准后继续人工编辑",
    });
    const draft = await prisma.editorialDraft.findUniqueOrThrow({ where: { id: wechatDraftId } });

    expect(draft.status).toBe("editing");
  });

  it("records a rejection reason and requires it", async () => {
    await expect(rejectEditorialDraft(prisma, xDraftId, "")).rejects.toThrow("reason");
    const rejected = await rejectEditorialDraft(prisma, xDraftId, "证据不足，暂不进入批准");

    expect(rejected.status).toBe("rejected");
    const revision = await prisma.draftRevision.findFirstOrThrow({ where: { editorialDraftId: xDraftId }, orderBy: { revisionNumber: "desc" } });
    expect(revision.changeSummary).toContain("证据不足");
  });
});
