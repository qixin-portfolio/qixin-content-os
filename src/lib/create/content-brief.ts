import type { ContentBrief } from "./types";

function clean(value: string) {
  return value.replace(/^[，,。！？!?\s]+|[，,。！？!?\s]+$/gu, "").trim();
}

function clauses(sourceText: string) {
  return sourceText
    .split(/[，,。！？!?；;]+/u)
    .map(clean)
    .filter(Boolean);
}

function firstMatching(items: string[], pattern: RegExp) {
  return items.find((item) => pattern.test(item)) ?? null;
}

function unique(items: Array<string | null | undefined>) {
  return Array.from(new Set(items.filter((item): item is string => Boolean(item?.trim()))));
}

export function extractContentBrief(sourceText: string): ContentBrief {
  const source = sourceText.trim();
  const parts = clauses(source);
  if (!source) {
    return {
      whatHappened: "",
      concreteDetails: [],
      personalReaction: null,
      tension: null,
      personalJudgment: null,
      unresolvedQuestion: null,
      possibleNextStep: null,
      confirmedFacts: [],
      unverifiedClaims: [],
      prohibitedClaims: [],
      missingContext: ["还没有提供可以分析的具体内容"],
      externalReferences: [],
    };
  }

  const externalMatch = source.match(/(?:看到|听到|读到)(?:一个)?观点[，,]?(?:说)?\s*([^。！？!?]+)/u);
  const externalReferences = externalMatch ? [clean(externalMatch[1])] : [];
  const personalReactionClause = firstMatching(parts, /我想到的是|原本想|本来想|没想到|终于感觉/u);
  const judgmentClause = firstMatching(parts, /我发现|我觉得|我越来越觉得|最近越来越觉得|终于感觉/u);
  const personalJudgment = judgmentClause && !/原本想|本来想/u.test(judgmentClause)
    ? clean(judgmentClause)
    : null;
  const personalReaction = personalReactionClause
    ? clean(personalReactionClause.replace(/^我想到的是/u, ""))
    : null;
  const tensionParts = parts.filter((part) => /反而|但是|但|最后|却|还是不够|一张也没|没正式上线/u.test(part));
  const tension = tensionParts.length > 0 ? tensionParts.join("，") : null;
  const unresolvedQuestion = firstMatching(parts, /没想明白|不知道|不确定|还没有结论|没有结论/u);
  const possibleNextStep = firstMatching(parts, /接下来|下一步|准备|打算|想先/u);

  const subjective = /我发现|我觉得|感觉|观点|想到|原本想|本来想/u;
  const concreteDetails = unique(parts.filter((part) => !subjective.test(part) || /昨天|今天|重新打开|出门|抱着|没拍|没上线|功能/u.test(part)));
  const confirmedFacts = unique(parts.filter((part) => !/会放大|一定|绝对|可能/u.test(part) && !/^我觉得/u.test(part)));
  if (/这是别人的观点|别人的观点/u.test(source)) confirmedFacts.push("这个观点来自别人");

  const prohibitedClaims: string[] = [];
  if (/没正式上线|没有正式上线|未正式上线/u.test(source)) prohibitedClaims.push("透明工地小程序已经正式上线");
  if (/客户验证.*不够|真实客户验证.*不够/u.test(source)) prohibitedClaims.push("已经获得充分的真实客户验证");
  if (externalReferences.length > 0) prohibitedClaims.push("外部观点是齐鑫原创观点");

  const unverifiedClaims = unique([
    ...externalReferences.map((item) => `外部观点：${item}`),
    ...parts.filter((part) => /会放大|越来越|像一个我会用的产品/u.test(part)),
  ]);
  const missingContext: string[] = [];
  if (source.length < 16) missingContext.push("可以补充一个具体变化或当时的感受");
  if (/客户验证.*不够/u.test(source)) missingContext.push("缺少真实客户验证的具体过程和结果");

  return {
    whatHappened: source,
    concreteDetails,
    personalReaction,
    tension,
    personalJudgment,
    unresolvedQuestion,
    possibleNextStep,
    confirmedFacts: unique(confirmedFacts),
    unverifiedClaims,
    prohibitedClaims,
    missingContext,
    externalReferences,
  };
}

export function constrainContentBrief(candidate: ContentBrief, sourceText: string): ContentBrief {
  const source = sourceText.trim();
  const baseline = extractContentBrief(source);
  const fromSource = (value: string | null) => value && source.includes(clean(value)) ? clean(value) : null;
  const sourceItems = (items: string[]) => unique(items.filter((item) => source.includes(clean(item))).map(clean));

  return {
    whatHappened: source,
    concreteDetails: unique([...sourceItems(candidate.concreteDetails), ...baseline.concreteDetails]),
    personalReaction: fromSource(candidate.personalReaction) ?? baseline.personalReaction,
    tension: fromSource(candidate.tension) ?? baseline.tension,
    personalJudgment: fromSource(candidate.personalJudgment) ?? baseline.personalJudgment,
    unresolvedQuestion: fromSource(candidate.unresolvedQuestion) ?? baseline.unresolvedQuestion,
    possibleNextStep: fromSource(candidate.possibleNextStep) ?? baseline.possibleNextStep,
    confirmedFacts: unique([...sourceItems(candidate.confirmedFacts), ...baseline.confirmedFacts]),
    unverifiedClaims: unique([...sourceItems(candidate.unverifiedClaims), ...baseline.unverifiedClaims]),
    prohibitedClaims: baseline.prohibitedClaims,
    missingContext: unique([...baseline.missingContext, ...candidate.missingContext]),
    externalReferences: unique([...sourceItems(candidate.externalReferences), ...baseline.externalReferences]),
  };
}
