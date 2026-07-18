export type SparseDraftKey = "record" | "perspective" | "concise";

export type SparseRealizationPlan = {
  immutableFacts: string[];
  userConclusions: string[];
  allowedInferences: string[];
  forbiddenAdditions: string[];
  eventTerms: string[];
  productTerms: string[];
  entryTerms: string[];
};

function unique(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function normalized(value: string) {
  return value.replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()]/gu, "").toLowerCase();
}

function containsTerm(body: string, term: string) {
  return normalized(body).includes(normalized(term));
}

function sentenceParts(value: string) {
  return value.split(/[。！？!?\n]+/u).map((item) => item.trim()).filter(Boolean);
}

function extractProducts(rawInput: string) {
  return unique((rawInput.match(/[A-Za-z][A-Za-z0-9]*(?:\s+[A-Za-z][A-Za-z0-9]*)*/gu) ?? [])
    .filter((term) => term.trim().length >= 3));
}

function extractEntries(rawInput: string) {
  return ["微信", "钉钉", "飞书", "Slack"].filter((term) => rawInput.includes(term));
}

function extractEventFact(rawInput: string) {
  return rawInput.match(/(?:今天)?(?:在)?(?:外面|外地)?出差/u)?.[0] ?? (rawInput.includes("出差") ? "出差" : undefined);
}

function extractUnavailableFact(rawInput: string, products: string[]) {
  for (const product of products) {
    const escaped = product.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const match = rawInput.match(new RegExp(`(?:没法|没办法|无法|不能).{0,8}?打开\\s*${escaped}`, "u"));
    if (match?.[0]) return match[0];
  }
  return undefined;
}

function extractConclusion(rawInput: string) {
  return rawInput.match(/(?:突然)?发现(.+?)(?:[。！？]|$)/u)?.[1]?.trim();
}

export function buildSparseRealizationPlan(rawInput: string): SparseRealizationPlan {
  const productTerms = extractProducts(rawInput);
  const entryTerms = extractEntries(rawInput);
  const eventFact = extractEventFact(rawInput);
  const unavailableFact = extractUnavailableFact(rawInput, productTerms);
  const conclusion = extractConclusion(rawInput);
  const product = productTerms[0];
  const entry = entryTerms[0];
  return {
    immutableFacts: unique([eventFact, unavailableFact, ...entryTerms, ...productTerms]),
    userConclusions: unique([conclusion]),
    allowedInferences: unique([
      eventFact ? "网页入口在外出时不方便" : undefined,
      product && entry ? `${product} 应更重视${entry}入口` : undefined,
      unavailableFact ? "工具是否好用也取决于需要时能否马上访问" : undefined,
    ]),
    forbiddenAdditions: [
      "执行公务",
      "客户",
      "会议",
      "城市",
      "交通工具",
      "办公环境",
      "官方设定",
      "指定系统",
      "高频使用习惯",
      "核心连接渠道",
    ],
    eventTerms: eventFact ? ["出差"] : [],
    productTerms,
    entryTerms,
  };
}

function reportLanguage(body: string) {
  return [
    /(?:认知|感知).{0,6}(?:变化|关键作用)/u,
    /(?:办公|使用).{0,4}场景/u,
    /(?:工具|系统).{0,4}适配/u,
    /(?:适配|工具).{0,8}场景/u,
    /办公.{0,4}(?:相关|入口|工具)/u,
    /适配.{0,8}(?:情况|环境)/u,
    /(?:入口|使用).{0,4}逻辑/u,
    /(?:可用|可及|适配|便捷).{0,3}性/u,
    /核心连接渠道/u,
    /这(?:说明|体现|反映)/u,
  ].some((pattern) => pattern.test(body));
}

function hasUnfoundedHabitualClaim(body: string) {
  return /(?:原本|平时|日常|一直).{0,6}(?:常用|习惯|高频)/u.test(body);
}

function factCategoryReplacement(body: string, plan: SparseRealizationPlan) {
  const replacesEvent = plan.eventTerms.length > 0
    && !plan.eventTerms.some((term) => containsTerm(body, term))
    && /执行(?:公务|任务)|公务|办公.{0,4}场景/u.test(body);
  const replacesProduct = plan.productTerms.length > 0
    && !plan.productTerms.some((term) => containsTerm(body, term))
    && /指定系统|内容管理系统|某系统/u.test(body);
  const replacesEntry = plan.entryTerms.length > 0
    && !plan.entryTerms.some((term) => containsTerm(body, term))
    && /核心连接渠道|消息渠道|沟通渠道/u.test(body);
  const rawFacts = plan.immutableFacts.join("\n");
  const addsOccupationalCategory = /办公/u.test(body) && !/办公/u.test(rawFacts);
  const addsAdaptationCategory = /适配/u.test(body) && !/适配/u.test(rawFacts);
  const addsEnvironmentCategory = /环境/u.test(body) && !/环境/u.test(rawFacts);
  const addsGenericSystem = /指定.{0,2}系统/u.test(body);
  return replacesEvent || replacesProduct || replacesEntry || addsOccupationalCategory || addsAdaptationCategory || addsEnvironmentCategory || addsGenericSystem;
}

function hasConceptRoleConfusion(body: string, plan: SparseRealizationPlan) {
  if (plan.productTerms.length === 0 || plan.entryTerms.length === 0) return false;
  const systemAsTool = /(?:不是|不再是).{0,12}(?:工具|系统).{0,12}而是.{0,12}入口/u.test(body);
  const systemAsPath = plan.productTerms.some((product) => new RegExp(`${product.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}.{0,8}(?:配套|替代).{0,4}(?:路径|渠道)`, "iu").test(body));
  const genericSystemAsTool = /(?:不是|不再是).{0,16}(?:指定.{0,2}系统|系统入口).{0,16}而是.{0,16}工具.{0,12}入口/u.test(body);
  const entryComparedToRoles = plan.entryTerms.some((entry) => new RegExp(`${entry}.{0,24}(?:不是|不再是).{0,16}(?:系统|工具).{0,16}而是.{0,16}(?:系统|工具)`, "u").test(body));
  const entryComparedToSystem = plan.entryTerms.some((entry) => plan.productTerms.some((product) => new RegExp(`${entry}.{0,24}(?:不是|不再是).{0,16}${product.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}.{0,16}而是.{0,16}${entry}`, "iu").test(body)));
  return systemAsTool || systemAsPath || genericSystemAsTool || entryComparedToRoles || entryComparedToSystem;
}

function hasImmediateAccessInference(body: string) {
  return /需要.{0,8}(?:马上|立刻).{0,8}(?:用|打开|访问)|能不能.{0,8}(?:马上|立刻).{0,8}(?:用|打开|访问)/u.test(body);
}

function repeatedJudgmentOpening(body: string) {
  const parts = sentenceParts(body);
  if (parts.length < 2) return false;
  const markers = ["我不只看", "我不仅看", "对我来说", "一个工具"];
  return markers.some((marker) => parts[0].startsWith(marker) && parts[1].startsWith(marker));
}

export function checkSparseDraftRealization(input: {
  key: SparseDraftKey;
  body: string;
  plan: SparseRealizationPlan;
}) {
  const { body, key, plan } = input;
  const issues = new Set<string>();
  for (const addition of plan.forbiddenAdditions) {
    if (!containsTerm(body, addition)) continue;
    if (["执行公务", "客户", "会议", "城市", "交通工具", "办公环境", "高频使用习惯"].includes(addition)) {
      issues.add(`unsupported_fact: ${addition}`);
    } else {
      issues.add("abstraction_replacement");
    }
  }
  if (hasUnfoundedHabitualClaim(body)) issues.add("unsupported_fact: habitual_claim");
  if (factCategoryReplacement(body, plan)) issues.add("abstraction_replacement");
  if (hasConceptRoleConfusion(body, plan)) issues.add("concept_role_confusion");
  if (reportLanguage(body)) issues.add("report_language");

  const hasEvent = plan.eventTerms.length === 0 || plan.eventTerms.some((term) => containsTerm(body, term));
  const hasProduct = plan.productTerms.length === 0 || plan.productTerms.some((term) => containsTerm(body, term));
  const hasEntry = plan.entryTerms.length === 0 || plan.entryTerms.some((term) => containsTerm(body, term));

  if (key === "record") {
    const hasUnavailableFact = plan.productTerms.length === 0 || plan.productTerms.some((product) => new RegExp(`(?:没法|没办法|无法|不能).{0,8}?打开\\s*${product.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`, "iu").test(body));
    if (!hasEvent || !hasUnavailableFact) issues.add("missing_immutable_fact");
  }

  if (key === "perspective") {
    if (!hasEvent && !hasImmediateAccessInference(body)) issues.add("missing_event_anchor");
    if (!hasProduct) issues.add("missing_product_anchor");
    if (!hasEntry) issues.add("missing_wechat_anchor");
    if (!hasProduct || !hasEntry || (!hasEvent && !hasImmediateAccessInference(body))) issues.add("generic_statement");
    if (repeatedJudgmentOpening(body)) issues.add("semantic_repetition");
  }

  if (key === "concise") {
    if (!hasProduct) issues.add("missing_product_anchor");
    if (!hasEntry) issues.add("missing_wechat_anchor");
    if (Array.from(body.trim()).length < 15 || Array.from(body.trim()).length > 35) issues.add("concise_length_out_of_range");
  }
  return Array.from(issues);
}

export function sparseRealizationPrompt(plan: SparseRealizationPlan) {
  return [
    `不可变事实：${plan.immutableFacts.join("；") || "无"}`,
    `用户已有结论：${plan.userConclusions.join("；") || "无"}`,
    `允许推论：${plan.allowedInferences.join("；") || "无"}`,
    `禁止新增或职业化改写：${plan.forbiddenAdditions.join("；")}`,
    "原事记录保留事件原貌和自然发现；克制判断必须回到产品与入口的具体关系；最短表达只提炼已有结论。保留用户原词，不得用正式概念替换事实。",
  ].join("\n");
}
