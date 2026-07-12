import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { generateEventCard } from "../src/lib/content/event-generator.ts";
import { importMarkdown } from "../src/lib/importers/markdown.ts";

const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const databasePath = databaseUrl.startsWith("file:")
  ? databaseUrl.slice("file:".length)
  : databaseUrl;
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databasePath }) });

const projects = [
  {
    name: "GEO Monitor",
    slug: "geo-monitor",
    description: "AI 搜索可见性监测 SaaS",
  },
  {
    name: "透明工地 SaaS",
    slug: "transparent-construction",
    description: "装修行业数字化管理工具",
  },
  {
    name: "晟景官网",
    slug: "shengjing-site",
    description: "本地装修企业 AI 搜索优化官网",
  },
  {
    name: "AI 视频画布",
    slug: "ai-video-canvas",
    description: "AI 视频生产工作流系统",
  },
];

const transparentMaterials: Array<{
  id: string;
  itemId: string;
  sourceType: "markdown";
  sourceName: string;
  sourcePath: string;
}> = [
  {
    id: "project-source-transparent-readme",
    itemId: "source-transparent-readme",
    sourceType: "markdown",
    sourceName: "透明工地产品 README",
    sourcePath: "02_products/transparent-site-miniapp/0_README.md",
  },
  {
    id: "project-source-transparent-handoff",
    itemId: "source-transparent-handoff",
    sourceType: "markdown",
    sourceName: "透明工地项目版本记录",
    sourcePath: "04_rd/版本记录/透明工地SaaS_版本记录.md",
  },
  {
    id: "project-source-transparent-summary",
    itemId: "source-transparent-summary",
    sourceType: "markdown",
    sourceName: "透明工地产品一页纸",
    sourcePath: "02_products/transparent-site-miniapp/透明工地小程序_产品一页纸.md",
  },
];

const manualEventInput = [
  "# 透明工地资料整理",
  "",
  "## 发生了什么",
  "已形成产品一页纸、功能模块清单和行业案例说明等产品资料。",
  "",
  "## 为什么重要",
  "需要把已有材料和待补证据分开管理。",
  "",
  "## 遇到问题",
  "当前缺少截图、后台版本记录、代码路径和真实项目案例。",
  "",
  "## 结果",
  "目前只能确认产品文档已形成，不能确认上线、客户、用户数量或收入。",
  "",
  "## 个人感受",
  "先保留证据缺口，比把产品规划写成已发生结果更重要。",
].join("\n");

async function main() {
  for (const project of projects) {
    await prisma.project.upsert({
      where: { slug: project.slug },
      update: { name: project.name, description: project.description },
      create: project,
    });
  }

  const transparentProject = await prisma.project.findUniqueOrThrow({
    where: { slug: "transparent-construction" },
  });
  const materialRoot = process.env.CONTENT_OS_MATERIAL_ROOT ?? "/Users/qixin/Documents/我的搞钱方向";
  const sourceItems = [] as Array<{ id: string; projectId: string; sourceType: "markdown" | "manual"; title: string; content: string; visibility: "private" }>;

  const manualSource = await prisma.projectSource.upsert({
    where: { id: "project-source-transparent-manual" },
    update: { sourceName: "人工补充：生成所需字段", metadataJson: JSON.stringify({ purpose: "mock-event-input" }) },
    create: {
      id: "project-source-transparent-manual",
      projectId: transparentProject.id,
      sourceType: "manual",
      sourceName: "人工补充：生成所需字段",
      sourcePath: "manual/phase2-event-input",
      metadataJson: JSON.stringify({ purpose: "mock-event-input" }),
    },
  });
  const manualDraft = importMarkdown(manualEventInput);
  const manualItem = await prisma.sourceItem.upsert({
    where: { id: "source-transparent-manual" },
    update: { content: manualDraft.content, title: manualDraft.title, projectSourceId: manualSource.id },
    create: {
      id: "source-transparent-manual",
      projectId: transparentProject.id,
      projectSourceId: manualSource.id,
      sourceType: "manual",
      title: manualDraft.title,
      content: manualDraft.content,
      sourcePath: "manual/phase2-event-input",
      visibility: "private",
    },
  });
  sourceItems.push({ ...manualItem, sourceType: "manual", visibility: "private" });

  for (const material of transparentMaterials) {
    const absolutePath = join(materialRoot, material.sourcePath);
    if (!existsSync(absolutePath)) {
      throw new Error(`Required real material not found: ${absolutePath}`);
    }

    const content = readFileSync(absolutePath, "utf8");
    const draft = importMarkdown(content);
    const projectSource = await prisma.projectSource.upsert({
      where: { id: material.id },
      update: {
        sourceName: material.sourceName,
        sourcePath: material.sourcePath,
        metadataJson: JSON.stringify({ importedFrom: absolutePath }),
      },
      create: {
        id: material.id,
        projectId: transparentProject.id,
        sourceType: material.sourceType,
        sourceName: material.sourceName,
        sourcePath: material.sourcePath,
        metadataJson: JSON.stringify({ importedFrom: absolutePath }),
      },
    });
    const sourceItem = await prisma.sourceItem.upsert({
      where: { id: material.itemId },
      update: { title: draft.title, content: draft.content, projectSourceId: projectSource.id },
      create: {
        id: material.itemId,
        projectId: transparentProject.id,
        projectSourceId: projectSource.id,
        sourceType: draft.sourceType,
        title: draft.title,
        content: draft.content,
        sourcePath: material.sourcePath,
        visibility: "private",
      },
    });
    sourceItems.push({ ...sourceItem, sourceType: "markdown", visibility: "private" });
  }

  const result = generateEventCard(sourceItems);
  if (!result.valid) {
    throw new Error(`Transparent construction EventCard validation failed: ${result.errors.join(", ")}`);
  }

  const { sourceItemIds, ...eventData } = result.eventCard;

  await prisma.eventCard.upsert({
    where: { id: "event-transparent-docs-phase2" },
    update: {
      ...eventData,
      sourceItems: { set: sourceItemIds.map((id) => ({ id })) },
    },
    create: {
      id: "event-transparent-docs-phase2",
      ...eventData,
      sourceItems: { connect: sourceItemIds.map((id) => ({ id })) },
    },
  });

  console.log(`Seeded ${projects.length} projects and ${sourceItems.length} transparent construction SourceItems.`);
  console.log("Seeded one evidence-bound EventCard: event-transparent-docs-phase2.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
