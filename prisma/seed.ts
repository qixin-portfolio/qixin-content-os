import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { generateContentAngles } from "../src/lib/content/angle-generator.ts";
import { scoreEventCard } from "../src/lib/content/content-scorer.ts";
import { generateEventCard } from "../src/lib/content/event-generator.ts";
import { generateMasterContentFromIntelligence } from "../src/lib/ai/content-generator.ts";
import { createInitialEditorialDraftRecord } from "../src/lib/editorial/revision-service.ts";
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

const voiceProfiles = [
  {
    id: "voice-wechat-default",
    name: "齐鑫朋友圈真实近况",
    platform: "wechat_moments" as const,
    tone: "熟人感、克制、真实、带个人感受，不像课程广告",
    preferredWords: ["最近", "折腾", "没想到", "慢慢发现", "记录一下", "还没完全做完"],
    avoidWords: ["震撼", "重磅", "颠覆行业", "普通人逆袭", "年入百万", "闭眼冲", "赋能"],
    writingRules: ["第一人称", "可以承认失败和没做完", "不要超过 500 中文字", "不堆砌 emoji", "不强行引导私信", "不使用成功学语气"],
    exampleTexts: [],
  },
  {
    id: "voice-x-default",
    name: "齐鑫 Build in Public",
    platform: "x" as const,
    tone: "简洁、过程导向、产品判断和实验记录",
    preferredWords: ["build in public", "workflow", "system", "experiment", "shipping", "iteration"],
    avoidWords: [],
    writingRules: ["优先具体判断和过程", "可生成单帖或 thread", "不假装技术专家", "中文为主，需要时保留英文术语"],
    exampleTexts: [],
  },
  {
    id: "voice-xiaohongshu-default",
    name: "摄影师的 AI 实测记录",
    platform: "xiaohongshu" as const,
    tone: "身份反差、真实过程、可复制经验",
    preferredWords: ["一个摄影师", "实测", "踩坑", "真实项目", "从零开始"],
    avoidWords: ["保姆级", "全网最全", "百分百有效", "一夜起飞"],
    writingRules: ["保留真实过程", "不把计划写成结果", "给出可核验的证据来源"],
    exampleTexts: [],
  },
  {
    id: "voice-douyin-default",
    name: "齐鑫真实项目口播",
    platform: "douyin" as const,
    tone: "口语化、镜头感、有冲突但不夸张",
    preferredWords: [],
    avoidWords: ["震撼", "重磅", "颠覆"],
    writingRules: ["前 3 秒说清楚冲突", "30 到 90 秒", "标注适合出现的录屏或项目画面", "不使用虚假悬念"],
    exampleTexts: [],
  },
];

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

  for (const voiceProfile of voiceProfiles) {
    await prisma.voiceProfile.upsert({
      where: { id: voiceProfile.id },
      update: {
        name: voiceProfile.name,
        platform: voiceProfile.platform,
        tone: voiceProfile.tone,
        preferredWordsJson: JSON.stringify(voiceProfile.preferredWords),
        avoidWordsJson: JSON.stringify(voiceProfile.avoidWords),
        writingRulesJson: JSON.stringify(voiceProfile.writingRules),
        exampleTextsJson: JSON.stringify(voiceProfile.exampleTexts),
        isDefault: true,
      },
      create: {
        id: voiceProfile.id,
        name: voiceProfile.name,
        platform: voiceProfile.platform,
        tone: voiceProfile.tone,
        preferredWordsJson: JSON.stringify(voiceProfile.preferredWords),
        avoidWordsJson: JSON.stringify(voiceProfile.avoidWords),
        writingRulesJson: JSON.stringify(voiceProfile.writingRules),
        exampleTextsJson: JSON.stringify(voiceProfile.exampleTexts),
        isDefault: true,
      },
    });
  }

  const persistedEvent = await prisma.eventCard.findUniqueOrThrow({
    where: { id: "event-transparent-docs-phase2" },
    include: { sourceItems: true },
  });
  const contentScore = scoreEventCard(persistedEvent, persistedEvent.sourceItems);
  await prisma.contentScore.upsert({
    where: { eventCardId: persistedEvent.id },
    update: {
      noveltyScore: contentScore.novelty.score,
      personalScore: contentScore.personal.score,
      industryScore: contentScore.industry.score,
      visualScore: contentScore.visual.score,
      businessScore: contentScore.business.score,
      totalScore: contentScore.totalScore,
      recommendation: contentScore.recommendation,
      reason: contentScore.reason,
    },
    create: {
      id: "score-event-transparent-docs-phase2",
      eventCardId: persistedEvent.id,
      noveltyScore: contentScore.novelty.score,
      personalScore: contentScore.personal.score,
      industryScore: contentScore.industry.score,
      visualScore: contentScore.visual.score,
      businessScore: contentScore.business.score,
      totalScore: contentScore.totalScore,
      recommendation: contentScore.recommendation,
      reason: contentScore.reason,
    },
  });

  const angles = generateContentAngles(persistedEvent, contentScore);
  for (const [index, angle] of angles.entries()) {
    await prisma.contentAngle.upsert({
      where: { id: `angle-event-transparent-docs-phase2-${index + 1}` },
      update: {
        angleType: angle.angleType,
        title: angle.title,
        coreIdea: angle.coreIdea,
        targetAudience: angle.targetAudience,
        recommendedPlatformsJson: JSON.stringify(angle.recommendedPlatforms),
        reason: angle.reason,
      },
      create: {
        id: `angle-event-transparent-docs-phase2-${index + 1}`,
        eventCardId: persistedEvent.id,
        angleType: angle.angleType,
        title: angle.title,
        coreIdea: angle.coreIdea,
        targetAudience: angle.targetAudience,
        recommendedPlatformsJson: JSON.stringify(angle.recommendedPlatforms),
        reason: angle.reason,
        selected: false,
      },
    });
  }

  const wechatVoice = voiceProfiles[0];
  const masterDraft = generateMasterContentFromIntelligence({
    eventCard: persistedEvent,
    contentScore,
    selectedAngle: angles[0],
    voiceProfile: wechatVoice,
  });
  const existingMaster = await prisma.masterContent.findUnique({
    where: { eventCardId: persistedEvent.id },
    select: { id: true },
  });
  if (!existingMaster) {
    await prisma.masterContent.create({
      data: {
        id: "master-event-transparent-docs-phase2",
        eventCardId: persistedEvent.id,
        title: masterDraft.title,
        hook: masterDraft.hook,
        story: masterDraft.story,
        insight: masterDraft.insight,
        reflection: masterDraft.reflection,
        cta: masterDraft.cta,
        factReferencesJson: JSON.stringify(masterDraft.factReferences),
        status: "drafting",
      },
    });
  }

  const persistedMaster = await prisma.masterContent.findUniqueOrThrow({
    where: { eventCardId: persistedEvent.id },
  });
  const editorialPlatforms = [
    ["wechat_moments", "voice-wechat-default"],
    ["x", "voice-x-default"],
    ["xiaohongshu", "voice-xiaohongshu-default"],
    ["douyin", "voice-douyin-default"],
  ] as const;
  for (const [platform, voiceProfileId] of editorialPlatforms) {
    await createInitialEditorialDraftRecord(prisma, persistedMaster, platform, voiceProfileId);
  }

  console.log(`Seeded ${projects.length} projects and ${sourceItems.length} transparent construction SourceItems.`);
  console.log("Seeded one evidence-bound EventCard: event-transparent-docs-phase2.");
  console.log("Seeded four EditorialDraft records without creating VoiceSamples.");
  console.log(JSON.stringify({ contentScore, angles, masterDraft }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
