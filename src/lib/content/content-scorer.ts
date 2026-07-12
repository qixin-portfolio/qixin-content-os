export type ScoreDimension = {
  score: number;
  reason: string;
};

export type ContentScoreDraft = {
  novelty: ScoreDimension;
  personal: ScoreDimension;
  industry: ScoreDimension;
  visual: ScoreDimension;
  business: ScoreDimension;
  totalScore: number;
  recommendation: "publish_now" | "combine_later" | "archive_only";
  reason: string;
};

export type PersistedContentScore = {
  noveltyScore: number;
  personalScore: number;
  industryScore: number;
  visualScore: number;
  businessScore: number;
  totalScore: number;
  recommendation: ContentScoreDraft["recommendation"];
  reason: string;
};

export function contentScoreFromPersistence(score: PersistedContentScore): ContentScoreDraft {
  const dimension = (value: number): ScoreDimension => ({ score: value, reason: score.reason });

  return {
    novelty: dimension(score.noveltyScore),
    personal: dimension(score.personalScore),
    industry: dimension(score.industryScore),
    visual: dimension(score.visualScore),
    business: dimension(score.businessScore),
    totalScore: score.totalScore,
    recommendation: score.recommendation,
    reason: score.reason,
  };
}

type ScorableEventCard = {
  title: string;
  whatHappened: string;
  whyItMatters: string;
  problem: string;
  result: string;
  personalReflection: string;
};

const evidenceTypes = new Set(["github", "markdown", "document", "image"]);

function dimension() {
  return { score: 0, reasons: [] as string[] };
}

function clamp(score: number) {
  return Math.min(20, Math.max(0, score));
}

export function scoreEventCard(
  eventCard: ScorableEventCard,
  sourceItems: Array<{ sourceType: string }>,
): ContentScoreDraft {
  const dimensions = {
    novelty: dimension(),
    personal: dimension(),
    industry: dimension(),
    visual: dimension(),
    business: dimension(),
  };
  const add = (key: keyof typeof dimensions, score: number, reason: string) => {
    dimensions[key].score += score;
    dimensions[key].reasons.push(reason);
  };

  const completeFacts = [
    eventCard.whatHappened,
    eventCard.whyItMatters,
    eventCard.problem,
    eventCard.result,
    eventCard.personalReflection,
  ].every((value) => value.trim().length > 0);
  if (completeFacts) {
    for (const key of Object.keys(dimensions) as Array<keyof typeof dimensions>) {
      add(key, 4, "EventCard 的核心事实字段完整");
    }
  }

  if (eventCard.result.trim()) {
    add("personal", 4, "有明确结果");
    add("business", 2, "有明确结果");
  }

  if (eventCard.personalReflection.trim()) {
    add("personal", 6, "有个人反思");
  }

  if (eventCard.problem.trim() && eventCard.result.trim()) {
    add("novelty", 4, "有问题与结果的对照");
    add("industry", 4, "有问题与结果的对照");
  }

  if (sourceItems.some((sourceItem) => evidenceTypes.has(sourceItem.sourceType))) {
    add("visual", 4, "有可核验的文档、图片或代码证据");
    add("novelty", 2, "有可核验证据");
  }

  const eventText = [
    eventCard.whatHappened,
    eventCard.problem,
    eventCard.result,
  ].join(" ");
  if (/(完成|形成|发布|失败|返工|关键决策)/.test(eventText)) {
    add("novelty", 6, "涉及真实产品过程或关键变化");
    add("personal", 4, "涉及真实产品过程或关键变化");
  }

  if (sourceItems.length >= 3) {
    add("novelty", 4, "有多个独立 SourceItem 交叉支持");
    add("industry", 4, "有多个独立 SourceItem 交叉支持");
    add("visual", 4, "有多个独立 SourceItem 交叉支持");
    add("business", 4, "有多个独立 SourceItem 交叉支持");
  }

  if (/(决定|选择|优先|重要|先)/.test(eventCard.personalReflection)) {
    add("novelty", 4, "包含个人判断或优先级选择");
    add("personal", 4, "包含个人判断或优先级选择");
  }

  if (/(行业|装修|施工|交付|信任|客户|产品)/.test(eventCard.whyItMatters)) {
    add("industry", 4, "包含行业或产品意义");
    add("business", 4, "包含行业或产品意义");
  }

  const scored = Object.fromEntries(
    Object.entries(dimensions).map(([key, value]) => [key, {
      score: clamp(value.score),
      reason: value.reasons.join("；") || "没有触发评分规则",
    }]),
  ) as Pick<ContentScoreDraft, "novelty" | "personal" | "industry" | "visual" | "business">;
  const totalScore = Object.values(scored).reduce((total, dimensionValue) => total + dimensionValue.score, 0);
  const recommendation = totalScore >= 80
    ? "publish_now"
    : totalScore >= 55
      ? "combine_later"
      : "archive_only";

  return {
    ...scored,
    totalScore,
    recommendation,
    reason: Object.values(scored).map((value) => value.reason).filter(Boolean).join("；"),
  };
}
