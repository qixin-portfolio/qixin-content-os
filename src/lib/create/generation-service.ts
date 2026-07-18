import { decorateGeneratedDrafts, type RawCreateDraft } from "./draft-generator";
import { checkDraftSimilarity } from "./similarity";
import { createGroundingContext, groundingWarnings } from "./grounding-context";
import { createFactLedger } from "./fact-ledger";
import { buildSparseRealizationPlan, checkSparseDraftRealization, type SparseRealizationPlan } from "./sparse-realization";
import {
  generationNotice,
  type CreateGenerationProvider,
  type DraftProviderInput, type DraftRepairInput,
  type ProviderCallMetadata,
} from "./provider";
import type { CreateSourceMode, CreateTopicCandidate, FactLedger, GroundingContext } from "./types";
import type { CreateVoiceSample } from "./voice-style";

type DraftOnlyProvider = Pick<CreateGenerationProvider, "id" | "mode" | "createDrafts" | "repairDraft">;
type DraftQualityProfile = "default" | "remote_content_bridge_sparse_personal";

function generationMetadata(
  provider: Pick<CreateGenerationProvider, "id" | "mode">,
  metadata: ProviderCallMetadata,
  slowThresholdMs: number,
) {
  return {
    mode: provider.mode,
    generationMode: provider.id,
    provider: provider.id,
    model: metadata.model,
    fallback: provider.mode === "deterministic_fallback",
    fallbackReason: null,
    notice: generationNotice(provider.mode),
    durationMs: metadata.durationMs,
    repairCount: metadata.repairCount,
    responseFormat: metadata.responseFormat,
    promptCharacters: metadata.promptCharacters,
    promptBudgetExceeded: metadata.promptBudgetExceeded,
    slowResponse: metadata.durationMs > slowThresholdMs,
  };
}

function topicsForUi(
  topics: Array<{
    title: string;
    focus: string;
    whyWorthWriting: string;
    angle: string;
    missingInformation: string[];
    sourceGrounding: string[];
  }>,
  sourceText: string,
): CreateTopicCandidate[] {
  const keys: CreateTopicCandidate["key"][] = ["record", "perspective", "focus"];
  return topics.map((topic, index) => {
    const grounded = topic.sourceGrounding.filter((item) => sourceText.includes(item));
    return {
      key: keys[index],
      title: topic.title,
      whyWorthWriting: topic.whyWorthWriting,
      recommendedAngle: topic.angle,
      platform: "朋友圈",
      missingInformation: topic.missingInformation.join("；"),
      sourceBasis: grounded.length > 0 ? grounded.join("；") : "来自本次原始输入，发布前请核对。",
      difference: topic.focus,
    };
  });
}

function factIssues(drafts: RawCreateDraft[], context: GroundingContext, factLedger: FactLedger) {
  const issues = new Set<string>();
  const externalFactIds = new Set(
    factLedger.facts.filter((fact) => fact.sourceType === "external_opinion").map((fact) => fact.id),
  );
  for (const draft of drafts) {
    if (/没(?:有)?正式上线|还没正式上线|未正式上线/u.test(context.rawInput)
      && /已经(?:正式)?上线|正式上线了/u.test(draft.body)) {
      issues.add("把未上线写成了已上线");
    }
    if (/客户验证(?:也|还|仍然)?不够|真实客户验证(?:也|还|仍然)?不够/u.test(context.rawInput)
      && /客户.{0,12}(?:充分|已经).{0,12}(?:认可|验证)|已经获得.{0,12}客户/u.test(draft.body)) {
      issues.add("把客户验证不足写成了客户认可或充分验证");
    }
    if (!/接下来|下一步|准备|打算|以后要/u.test(context.rawInput)
      && /接下来|下一步|以后要|准备去|打算/u.test(draft.body)) {
      issues.add("输入没有下一步，但稿件强制添加了下一步");
    }
    const citesExternalOpinion = (draft.usedFacts ?? []).some((fact) => fact.factIds.some((id) => externalFactIds.has(id)));
    if (citesExternalOpinion && !/别人|外部|看到|听到|读到|观点来自|有人提出/u.test(draft.body)) {
      issues.add("外部观点没有明确归属");
    }
    if (!/我发现|我觉得|我认为|感觉|意义|人生|成长/u.test(context.rawInput)
      && /人生|成长|教会了我|意义在于/u.test(draft.body)) {
      issues.add("生活内容被自动升华");
    }
    if (!/用户数量|用户数|\d+\s*个用户/u.test(context.rawInput) && /\d+\s*个用户|用户数量/u.test(draft.body)) {
      issues.add("新增了输入中没有的用户数量");
    }
    if (!/收入|成交|营收|销售额/u.test(context.rawInput) && /收入|成交|营收|销售额/u.test(draft.body)) {
      issues.add("新增了输入中没有的收入或成交结果");
    }
  }
  return Array.from(issues);
}

function sourceContractIssues(drafts: RawCreateDraft[], factLedger: FactLedger) {
  const issues: string[] = [];
  const factIds = new Set(factLedger.facts.map((fact) => fact.id));
  const factText = factLedger.facts.map((fact) => fact.text).join("\n");
  for (const draft of drafts) {
    if ((draft.usedFacts ?? []).length === 0) issues.push("草稿没有提供事实 ID");
    for (const fact of draft.usedFacts ?? []) {
      if (fact.factIds.length === 0) issues.push("具体事实没有关联 fact ID");
      if (fact.factIds.some((id) => !factIds.has(id))) issues.push("草稿引用了不存在的 fact ID");
    }
    for (const interpretation of draft.interpretations ?? []) {
      if (interpretation.basisFactIds.length === 0) issues.push("抽象判断没有关联 fact ID");
      if (interpretation.basisFactIds.some((id) => !factIds.has(id))) issues.push("抽象判断引用了不存在的 fact ID");
      if (hasConcreteDetail(interpretation.text)) {
        issues.push("抽象判断包含新的具体事实");
      }
    }
    for (const detail of draft.body.match(new RegExp(ungroundedDetailPattern, "gu")) ?? []) {
      if (!factText.includes(detail)) issues.push(`出现无来源具体细节：${detail}`);
    }
  }
  return Array.from(new Set(issues));
}

const ungroundedDetailPattern = /今天|昨天|这两天|最近一次|(?:在|到|从)(?:西湖|公园|公司|办公室|家里|路上|门口|车里|楼下|咖啡店|医院|学校|杭州|北京)[^，。\n]{0,8}|盯着|走到|等了|拍了|坐在|拿着|翻了|跑去|关掉|打开|手酸|抱着|相机|单元门|菜单层级|需求文档|焦虑|开心|难过|疲惫|疼|饿|困|发抖|“[^”\n]{1,30}”|\d+|(?:[二三四五六七八九十]+个|[一二三四五六七八九十]+(?:分钟|小时))|项目成功|已经成功|大获成功/u;

function hasConcreteDetail(text: string) {
  return ungroundedDetailPattern.test(text);
}

function normalizedDraftText(value: string) {
  return value.replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()]/gu, "").toLowerCase();
}

function orderedOverlapRatio(left: string, right: string) {
  const a = Array.from(normalizedDraftText(left)).slice(0, 480);
  const b = Array.from(normalizedDraftText(right)).slice(0, 480);
  if (a.length < 12 || b.length < 12) return 0;
  let previous = new Array<number>(b.length + 1).fill(0);
  for (const character of a) {
    const current = [0];
    for (let index = 1; index <= b.length; index += 1) {
      current[index] = character === b[index - 1]
        ? previous[index - 1] + 1
        : Math.max(previous[index], current[index - 1]);
    }
    previous = current;
  }
  return previous[b.length] / Math.min(a.length, b.length);
}

function sentenceParts(value: string) {
  return value.split(/[。！？!?\n]+/u).map((item) => item.trim()).filter(Boolean);
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function sparseAnchors(rawInput: string) {
  const anchors = new Set<string>();
  const systemTerms = new Set<string>();
  const entryTerms = new Set<string>();
  for (const term of rawInput.match(/[A-Za-z][A-Za-z0-9]*(?:\s+[A-Za-z][A-Za-z0-9]*)*/gu) ?? []) {
    if (term.trim().length >= 3) {
      anchors.add(term.trim());
      systemTerms.add(term.trim());
    }
  }
  for (const event of ["出差", "微信", "网页"]) {
    if (rawInput.includes(event)) anchors.add(event);
  }
  for (const term of ["微信", "钉钉", "飞书", "Slack", "网页"]) {
    if (rawInput.includes(term)) entryTerms.add(term);
  }
  return { anchors: Array.from(anchors), systemTerms: Array.from(systemTerms), entryTerms: Array.from(entryTerms) };
}

function anchorCount(body: string, anchors: string[]) {
  const normalized = normalizedDraftText(body);
  return anchors.filter((anchor) => normalized.includes(normalizedDraftText(anchor))).length;
}

function abstractReportIssues(body: string) {
  const patterns = [
    /(?:特定|不同).{0,4}场景/u,
    /办公.{0,3}环境/u,
    /使用.{0,4}限制/u,
    /(?:认知|感知).{0,4}(?:变化|不同)/u,
    /核心.{0,3}入口/u,
    /(?:可用|可及|适配|便捷).{0,2}性/u,
    /预设.{0,4}定位/u,
    /基础.{0,3}需求/u,
    /使用体验.{0,4}层面/u,
    /这(?:体现|反映)了/u,
    /这说明(?:了)?/u,
    /外出出差(?:期间)?/u,
  ];
  const abstractNouns = body.match(/[一-龥]{2,6}性/gu) ?? [];
  const matches = patterns.filter((pattern) => pattern.test(body));
  if (abstractNouns.length >= 2) matches.push(/抽象名词连续堆叠/u);
  return matches.length > 0 ? ["抽象报告词或分类结构"] : [];
}

function conceptRelationIssues(body: string, rawInput: string) {
  const { systemTerms, entryTerms } = sparseAnchors(rawInput);
  const normalized = normalizedDraftText(body);
  const issues: string[] = [];
  for (const system of systemTerms) {
    for (const entry of entryTerms) {
      const systemPattern = escapePattern(normalizedDraftText(system));
      const entryPattern = escapePattern(normalizedDraftText(entry));
      if (new RegExp(`入口.{0,10}不是${systemPattern}.{0,10}而是${entryPattern}`, "u").test(normalized)
        || new RegExp(`${systemPattern}.{0,12}(?:和|还是).{0,12}${entryPattern}.{0,12}入口`, "u").test(normalized)
        || new RegExp(`${entryPattern}.{0,8}(?:取代|替代).{0,8}${systemPattern}`, "u").test(normalized)) {
        issues.push("系统与入口的概念关系错误");
      }
    }
  }
  return issues;
}

function remoteDraftIssues(draft: RawCreateDraft, context: GroundingContext, sparseRealization: SparseRealizationPlan) {
  const issues: string[] = [];
  const body = draft.body.trim();
  const normalizedBody = normalizedDraftText(body);
  const normalizedRawInput = normalizedDraftText(context.rawInput);
  const anchors = sparseAnchors(context.rawInput).anchors;
  const retainedAnchors = anchorCount(body, anchors);
  const abstractIssues = abstractReportIssues(body);
  const recordIsNearCopy = normalizedRawInput.length >= 24
    && orderedOverlapRatio(body, context.rawInput) >= 0.85
    && normalizedBody.length < normalizedRawInput.length + 16;
  if (draft.key === "record" && (normalizedBody === normalizedRawInput || recordIsNearCopy)) {
    issues.push("原事记录直接复制或近似复述原始输入");
  }
  if (draft.key === "record" && normalizedRawInput.length >= 24 && (normalizedBody.length < normalizedRawInput.length + 12 || !/[。！？!?]/u.test(body))) {
    issues.push("原事记录没有展开事实后的自然发现");
  }
  if (draft.key === "record" && /某(?:系统|工具)|开展工作/u.test(body)) {
    issues.push("原事记录用泛化替代了已有事实");
  }
  if (draft.key === "record" && (sentenceParts(body).length < 2 || sentenceParts(body).length > 3)) {
    issues.push("原事记录没有保持两到三句的事件与发现结构");
  }
  if (draft.key === "record" && anchors.length >= 2 && retainedAnchors < 2) {
    issues.push("原事记录丢失具体事件锚点");
  }
  if (draft.key === "record") issues.push(...abstractIssues);
  if (draft.key === "perspective" && /(?:这是.{0,24}(?:场景下|场景中的).{0,24}(?:认知变化|变化)|这(?:反映|体现)了|这说明了.{0,24}重要性|这是一次关于)/u.test(body)) {
    issues.push("克制判断使用报告式分类语言");
  }
  if (draft.key === "perspective" && (normalizedDraftText(body).length < 24 || !/(?:不只|不仅|不是|而是|要看|能不能|只有|更要|才是|决定)/u.test(body))) {
    issues.push("克制判断没有形成完整推论");
  }
  if (draft.key === "perspective" && !/我/u.test(body)) {
    issues.push("克制判断缺少第一人称落点");
  }
  if (draft.key === "perspective" && anchors.length > 0 && retainedAnchors < 1) {
    issues.push("克制判断丢失事件或产品锚点");
  }
  if (draft.key === "perspective") {
    issues.push(...abstractIssues);
    const parts = sentenceParts(body);
    if (parts.length >= 2 && parts.every((part) => abstractReportIssues(part).length > 0) && retainedAnchors === 0) {
      issues.push("克制判断两句抽象同义重复");
    }
  }
  if (draft.key === "concise" && (normalizedDraftText(body).length < 10 || /^(?:标签|分类|概念|认知变化|工具使用)/u.test(body) || !/(?:不是.{0,24}而是|不该.{0,24}而该|才发现[：:]|真正的.{0,12}(?:不是|不该|应该是))/u.test(body))) {
    issues.push("最短表达缺少独立完整含义");
  }
  if (draft.key === "concise" && Array.from(body).length > 35) {
    issues.push("最短表达超过长度上限");
  }
  issues.push(...conceptRelationIssues(body, context.rawInput));
  issues.push(...checkSparseDraftRealization({ key: draft.key, body, plan: sparseRealization }));
  return issues;
}

function remoteSimilarityCheck(drafts: RawCreateDraft[]) {
  const retryKeys = new Set<RawCreateDraft["key"]>();
  for (let leftIndex = 0; leftIndex < drafts.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < drafts.length; rightIndex += 1) {
      if (orderedOverlapRatio(drafts[leftIndex].body, drafts[rightIndex].body) >= 0.78) {
        retryKeys.add(drafts[rightIndex].key);
      }
    }
  }
  return retryKeys.size > 0 ? { issues: ["drafts_too_similar"], retryKeys: Array.from(retryKeys) } : { issues: [], retryKeys: [] };
}

function qualityCheck(
  drafts: RawCreateDraft[],
  context: GroundingContext,
  voiceSamples: CreateVoiceSample[],
  factLedger: FactLedger,
  profile: DraftQualityProfile = "default",
  sparseRealization?: SparseRealizationPlan,
) {
  const similarity = checkDraftSimilarity(drafts, voiceSamples);
  const facts = factIssues(drafts, context, factLedger);
  const contract = sourceContractIssues(drafts, factLedger);
  const roleIssues = profile === "remote_content_bridge_sparse_personal"
    ? drafts.flatMap((draft) => remoteDraftIssues(draft, context, sparseRealization ?? buildSparseRealizationPlan(context.rawInput)))
    : [];
  const remoteSimilarity = profile === "remote_content_bridge_sparse_personal" ? remoteSimilarityCheck(drafts) : { issues: [], retryKeys: [] };
  return {
    valid: similarity.valid && facts.length === 0 && contract.length === 0 && roleIssues.length === 0 && remoteSimilarity.issues.length === 0,
    issues: Array.from(new Set([...similarity.issues, ...facts, ...contract, ...roleIssues, ...remoteSimilarity.issues])),
    retryKeys: Array.from(new Set([...similarity.retryKeys, ...remoteSimilarity.retryKeys])),
  };
}

function constrainDraftMetadata(draft: RawCreateDraft): RawCreateDraft {
  return {
    ...draft,
    usedFacts: draft.usedFacts,
    interpretations: draft.interpretations,
  };
}

export async function generateDraftPackage(input: {
  provider: DraftOnlyProvider;
  topic: CreateTopicCandidate;
  sourceMode: CreateSourceMode;
  sourceText: string;
  voiceStyleSummary: string;
  voiceSamples: CreateVoiceSample[];
  factAnswers?: string[];
  detailMode?: "enriched" | "sparse";
  qualityProfile?: DraftQualityProfile;
}) {
  const groundingContext = createGroundingContext({
    rawInput: input.sourceText,
    sourceMode: input.sourceMode,
    platform: "wechat_moments",
  });
  const factLedger = createFactLedger({
    rawInput: input.sourceText,
    factAnswers: input.factAnswers ?? [],
    sourceMode: input.sourceMode,
  });
  const qualityProfile = input.qualityProfile ?? "default";
  const sparseRealization = qualityProfile === "remote_content_bridge_sparse_personal"
    ? buildSparseRealizationPlan(input.sourceText)
    : undefined;
  const providerInput: DraftProviderInput = {
    groundingContext,
    topic: input.topic,
    voiceStyleSummary: input.voiceStyleSummary,
    factLedger,
    detailMode: input.detailMode ?? "sparse",
    sparseRealization,
  };
  const initial = await input.provider.createDrafts(providerInput);
  let rawDrafts = initial.data.map(constrainDraftMetadata);
  const perDraft = rawDrafts.map((draft) => qualityCheck([draft], groundingContext, input.voiceSamples, factLedger, qualityProfile, sparseRealization));
  const packageCheck = qualityCheck(
    rawDrafts.filter((_, index) => perDraft[index].valid),
    groundingContext,
    input.voiceSamples,
    factLedger,
    qualityProfile,
    sparseRealization,
  );
  const perDraftRejected = rawDrafts.map((draft, index) => ({ draft, check: perDraft[index] })).filter((item) => !item.check.valid);
  const rejected = qualityProfile === "remote_content_bridge_sparse_personal"
    ? rawDrafts.filter((draft, index) => !perDraft[index].valid || packageCheck.retryKeys.includes(draft.key)).map((draft) => ({ draft, check: perDraft[rawDrafts.indexOf(draft)] }))
    : perDraftRejected;
  let retryCount = 0;
  for (const item of qualityProfile === "remote_content_bridge_sparse_personal" ? rejected.slice(0, 1) : rejected) {
    if (!input.provider.repairDraft) continue;
    retryCount += 1;
    const repairInput: DraftRepairInput = {
      factLedger,
      allowedFactIds: factLedger.facts.map((fact) => fact.id),
      detailMode: input.detailMode ?? "sparse",
      topic: input.topic,
      key: item.draft.key,
      rejectedReasons: item.check.issues,
      ...(sparseRealization ? { sparseRealization } : {}),
    };
    try {
      if (!input.provider.repairDraft) throw new Error("repair unavailable");
      const repaired = constrainDraftMetadata((await input.provider.repairDraft(repairInput)).data);
      const repairedCheck = qualityCheck([repaired], groundingContext, input.voiceSamples, factLedger, qualityProfile, sparseRealization);
      const index = rawDrafts.findIndex((draft) => draft.key === item.draft.key);
      rawDrafts[index] = repairedCheck.valid ? { ...repaired, qualityStatus: "repaired" } : { ...item.draft, qualityStatus: "rejected_for_ungrounded_details", rejectedReasons: repairedCheck.issues };
    } catch {
      const index = rawDrafts.findIndex((draft) => draft.key === item.draft.key);
      rawDrafts[index] = { ...item.draft, qualityStatus: "rejected_for_ungrounded_details", rejectedReasons: item.check.issues };
    }
  }
  if (qualityProfile === "remote_content_bridge_sparse_personal") {
    const finalPerDraft = rawDrafts.map((draft) => qualityCheck([draft], groundingContext, input.voiceSamples, factLedger, qualityProfile, sparseRealization));
    const finalPackage = qualityCheck(
      rawDrafts.filter((_, index) => finalPerDraft[index].valid),
      groundingContext,
      input.voiceSamples,
      factLedger,
      qualityProfile,
      sparseRealization,
    );
    rawDrafts = rawDrafts.map((draft, index) => {
      const rejectedByQuality = !finalPerDraft[index].valid || finalPackage.retryKeys.includes(draft.key);
      return !rejectedByQuality
        ? draft.qualityStatus ? draft : { ...draft, qualityStatus: "passed" }
        : { ...draft, qualityStatus: "rejected_for_ungrounded_details", rejectedReasons: Array.from(new Set([...finalPerDraft[index].issues, ...finalPackage.issues])) };
    });
  } else {
    rawDrafts = rawDrafts.map((draft, index) => draft.qualityStatus ? draft : { ...draft, qualityStatus: perDraft[index].valid ? "passed" : "rejected_for_ungrounded_details", rejectedReasons: perDraft[index].issues });
  }
  const visibleDrafts = rawDrafts.filter((draft) => draft.qualityStatus !== "rejected_for_ungrounded_details");
  const quality = qualityCheck(visibleDrafts, groundingContext, input.voiceSamples, factLedger, qualityProfile, sparseRealization);
  const rejectedIssues = rawDrafts.flatMap((draft) => draft.rejectedReasons ?? []);
  return {
    drafts: decorateGeneratedDrafts(visibleDrafts, {
      groundingContext,
      topic: input.topic,
      sourceMode: input.sourceMode,
      sourceText: input.sourceText,
      voiceSamples: input.voiceSamples,
    }),
    generation: generationMetadata(input.provider, initial.metadata, 35_000),
    qualityStatus: rawDrafts.some((draft) => draft.qualityStatus === "rejected_for_ungrounded_details") ? "insufficient" as const : quality.valid ? "passed" as const : "insufficient" as const,
    qualityMessage: quality.valid ? null : quality.issues.some((issue) => /fact ID|具体细节|抽象判断/u.test(issue))
      ? "模型补写了你没有提供的细节，请补充信息或使用短版。"
      : "三个版本的结构差异不足，请保留原始输入并重试。",
    qualityIssues: Array.from(new Set([...quality.issues, ...rejectedIssues])),
    retryCount,
    rejectedDrafts: rawDrafts.filter((draft) => draft.qualityStatus === "rejected_for_ungrounded_details").map((draft) => ({ key: draft.key, qualityStatus: draft.qualityStatus, rejectedReasons: draft.rejectedReasons ?? [] })),
  };
}

export async function generateTopicPackage(input: {
  provider: CreateGenerationProvider;
  sourceMode: CreateSourceMode;
  sourceText: string;
  platform: "wechat_moments";
  voiceStyleSummary: string;
}) {
  const groundingContext = createGroundingContext({
    rawInput: input.sourceText,
    sourceMode: input.sourceMode,
    platform: input.platform,
  });
  const result = await input.provider.createTopics({
    groundingContext,
    voiceStyleSummary: input.voiceStyleSummary,
  });
  const topics = topicsForUi(result.data.topics, input.sourceText);
  return {
    topics,
    generation: generationMetadata(input.provider, result.metadata, 25_000),
    lightweightWarnings: groundingWarnings(groundingContext),
  };
}
