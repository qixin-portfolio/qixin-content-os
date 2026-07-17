import type { CreateSourceMode, GroundingContext } from "./types";

type GroundingInput = {
  rawInput: string;
  sourceMode: CreateSourceMode;
  platform: "wechat_moments";
};

function unique(values: string[]) {
  return Array.from(new Set(values));
}

export function createGroundingContext(input: GroundingInput): GroundingContext {
  const source = input.rawInput;
  const externalOpinionMarkers = [
    "看到一个观点",
    "听到一个观点",
    "读到一个观点",
    "这是别人的观点",
    "别人说",
    "有人说",
  ].filter((marker) => source.includes(marker));
  if (input.sourceMode === "external_material") externalOpinionMarkers.push("授权外部素材");

  const prohibitedClaims: string[] = [];
  if (/没(?:有)?正式上线|还没正式上线|未正式上线/u.test(source)) {
    prohibitedClaims.push("写成已经正式上线");
  }
  if (/客户验证(?:也|还|仍然)?不够|真实客户验证(?:也|还|仍然)?不够/u.test(source)) {
    prohibitedClaims.push("写成已经获得充分的真实客户验证");
  }
  if (externalOpinionMarkers.length > 0) {
    prohibitedClaims.push("把外部观点写成齐鑫原创观点");
  }
  if (!/用户数量|用户数|\d+\s*个用户/u.test(source)) prohibitedClaims.push("新增用户数量");
  if (!/收入|成交|营收|销售额/u.test(source)) prohibitedClaims.push("新增收入或成交结果");
  if (!/客户反馈|客户评价|客户说/u.test(source)) prohibitedClaims.push("新增客户反馈");

  const missingContext: string[] = [];
  if (input.sourceMode === "manual") missingContext.push("手动输入尚未经过项目证据核验");
  if (Array.from(source.trim()).length < 16) missingContext.push("可以补充一个具体变化或当时发生的事情");
  if (/客户验证(?:也|还|仍然)?不够/u.test(source)) missingContext.push("缺少真实客户验证的具体过程和结果");

  return {
    rawInput: source,
    sourceMode: input.sourceMode,
    platform: input.platform,
    confirmedUserStatements: source.trim() ? [source] : [],
    externalOpinionMarkers,
    prohibitedClaims: unique(prohibitedClaims),
    missingContext: unique(missingContext),
  };
}

export function groundingWarnings(context: GroundingContext) {
  return [
    ...context.prohibitedClaims.map((claim) => `不要${claim}`),
    ...context.missingContext,
  ].slice(0, 3);
}
