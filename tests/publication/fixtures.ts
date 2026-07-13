import Database from "better-sqlite3";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  "prisma/migrations/20260713170000_add_publication_packages/migration.sql",
  "prisma/migrations/20260714090000_add_phase6a_obsidian_research/migration.sql",
];

export async function createPublicationTestContext(label: string) {
  const suffix = randomUUID();
  const databasePath = join(tmpdir(), `qixin-content-os-publication-${label}-${suffix}.db`);
  const database = new Database(databasePath);
  for (const migrationPath of migrationPaths) {
    database.exec(readFileSync(migrationPath, "utf8"));
  }
  database.close();

  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databasePath }) });
  const project = await prisma.project.create({
    data: {
      name: "透明工地 SaaS",
      slug: "transparent-construction",
      description: "装修行业数字化管理工具",
    },
  });
  const sourceItems = await Promise.all([
    prisma.sourceItem.create({
      data: {
        projectId: project.id,
        sourceType: "markdown",
        title: "透明工地产品 README",
        content: "产品一页纸、功能模块清单和行业案例说明已经形成。",
        sourcePath: "02_products/transparent-site-miniapp/0_README.md",
      },
    }),
    prisma.sourceItem.create({
      data: {
        projectId: project.id,
        sourceType: "markdown",
        title: "透明工地项目版本记录",
        content: "当前缺少截图、后台版本记录、代码路径整理和真实项目案例。",
        sourcePath: "04_rd/版本记录/透明工地SaaS_版本记录.md",
      },
    }),
    prisma.sourceItem.create({
      data: {
        projectId: project.id,
        sourceType: "markdown",
        title: "透明工地产品一页纸",
        content: "现有材料不能证明正式上线、客户、用户数量或收入。",
        sourcePath: "02_products/transparent-site-miniapp/透明工地小程序_产品一页纸.md",
      },
    }),
    prisma.sourceItem.create({
      data: {
        projectId: project.id,
        sourceType: "manual",
        title: "人工事实边界记录",
        content: "只写能证明的内容，不能证明的先保留。",
        sourcePath: "/Users/private/should-not-enter-snapshot.md",
      },
    }),
  ]);
  const event = await prisma.eventCard.create({
    data: {
      projectId: project.id,
      title: "透明工地资料整理",
      whatHappened: "已形成产品一页纸、功能模块清单和行业案例说明等产品资料。",
      whyItMatters: "需要把已有材料和待补证据分开管理。",
      problem: "当前缺少截图、后台版本记录、代码路径和真实项目案例。",
      result: "目前只能确认产品文档已形成，不能确认上线、客户、用户数量或收入。",
      personalReflection: "先保留证据缺口，比把产品规划写成已发生结果更重要。",
      evidenceRequired: "截图、后台版本记录、代码路径整理、真实项目案例",
      sourceItems: { connect: sourceItems.map(({ id }) => ({ id })) },
    },
  });
  const master = await prisma.masterContent.create({
    data: {
      eventCardId: event.id,
      title: "透明工地资料整理",
      hook: "",
      story: "产品文档已经形成。",
      insight: "能证明的就写，不能证明的先留着。",
      reflection: "没做完就先写没做完。",
      cta: "",
      factReferencesJson: JSON.stringify(sourceItems.map(({ id }) => id)),
    },
  });
  const wechatVoice = await prisma.voiceProfile.create({
    data: {
      id: `voice-publication-wechat-${suffix}`,
      name: "朋友圈发布包测试声音",
      platform: "wechat_moments",
      tone: "真实克制",
      preferredWordsJson: "[]",
      avoidWordsJson: "[]",
      writingRulesJson: "[]",
      exampleTextsJson: "[]",
    },
  });
  const xVoice = await prisma.voiceProfile.create({
    data: {
      id: `voice-publication-x-${suffix}`,
      name: "X 发布包测试声音",
      platform: "x",
      tone: "真实克制",
      preferredWordsJson: "[]",
      avoidWordsJson: "[]",
      writingRulesJson: "[]",
      exampleTextsJson: "[]",
    },
  });
  const approvedDraft = await createInitialEditorialDraftRecord(
    prisma,
    master,
    "wechat_moments",
    wechatVoice.id,
  );
  const sourceRevision = await createHumanRevision(prisma, approvedDraft.id, {
    title: "透明工地资料整理（测试批准版）",
    hook: "",
    body: [
      "最近重新整理透明工地这个项目，翻了一圈才发现，之前其实做了不少东西：产品一页纸、功能模块清单、行业案例说明都有了。",
      "",
      "但真要问一句“现在到底做到哪了”，截图、后台版本记录、代码路径，还有真实项目案例，都还没整理齐。",
      "",
      "以前很容易把“已经想清楚”和“已经做成了”混在一起。现在我反而更愿意把它们分开：能证明的就写，不能证明的先留着。",
      "",
      "所以目前能确认的，只是产品文档已经形成。上线、客户、用户数量和收入，现在的材料还证明不了这些。",
      "",
      "没做完就先写没做完。等证据补上，再继续往前说。",
    ].join("\n"),
    cta: "",
    changeSummary: "发布包测试人工稿",
  });
  const approval = await approveEditorialDraft(prisma, approvedDraft.id, {
    overrideReason: "仅用于临时数据库发布包测试",
    qualityRating: 5,
  });
  const unapprovedDraft = await createInitialEditorialDraftRecord(prisma, master, "x", xVoice.id);
  await createHumanRevision(prisma, unapprovedDraft.id, {
    title: "未批准测试稿",
    hook: "",
    body: "这条测试稿没有批准。",
    cta: "",
    changeSummary: "保持未批准状态",
  });

  return {
    prisma,
    databasePath,
    project,
    event,
    master,
    sourceItems,
    approvedDraftId: approvedDraft.id,
    unapprovedDraftId: unapprovedDraft.id,
    sourceRevisionId: sourceRevision.id,
    approvalRevisionId: approval.approvalRevisionId,
    approvedVoiceSampleId: approval.voiceSampleId,
  };
}

export async function disposePublicationTestContext(
  context: Awaited<ReturnType<typeof createPublicationTestContext>>,
) {
  await context.prisma.$disconnect();
  rmSync(context.databasePath, { force: true });
}
