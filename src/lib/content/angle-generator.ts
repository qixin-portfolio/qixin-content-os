import type { ContentScoreDraft } from "./content-scorer";

export type AngleType =
  | "personal_growth"
  | "build_in_public"
  | "industry_observation"
  | "practical_method"
  | "commercial_experiment";

export type ContentAngleDraft = {
  angleType: AngleType;
  title: string;
  coreIdea: string;
  targetAudience: string;
  recommendedPlatforms: Array<"wechat_moments" | "x" | "xiaohongshu" | "douyin">;
  reason: string;
};

type AngleEventCard = {
  whatHappened: string;
  whyItMatters: string;
  problem: string;
  result: string;
  personalReflection: string;
};

export function generateContentAngles(
  eventCard: AngleEventCard,
  contentScore: ContentScoreDraft,
): ContentAngleDraft[] {
  const candidates: ContentAngleDraft[] = [
    {
      angleType: "personal_growth",
      title: "记录这件事带来的一个变化",
      coreIdea: eventCard.personalReflection,
      targetAudience: "正在记录真实项目过程的人",
      recommendedPlatforms: ["wechat_moments", "xiaohongshu"],
      reason: "个人反思提供了具体的第一人称入口。",
    },
    {
      angleType: "industry_observation",
      title: "从这个问题看行业现场",
      coreIdea: `${eventCard.problem} 这件事让我重新看见：${eventCard.whyItMatters}`,
      targetAudience: "关注装修、施工和行业数字化的人",
      recommendedPlatforms: ["wechat_moments", "x", "xiaohongshu"],
      reason: "问题和为什么重要共同构成行业观察。",
    },
    {
      angleType: "build_in_public",
      title: "公开记录一次真实项目过程",
      coreIdea: `${eventCard.whatHappened} 当前能确认的结果是：${eventCard.result}`,
      targetAudience: "关注独立开发和真实项目过程的人",
      recommendedPlatforms: ["x", "wechat_moments"],
      reason: "事实过程和已确认结果适合公开记录。",
    },
    {
      angleType: "practical_method",
      title: "把这次过程拆成可复盘步骤",
      coreIdea: `先看问题，再核对结果：${eventCard.problem} → ${eventCard.result}`,
      targetAudience: "需要整理项目过程和证据的人",
      recommendedPlatforms: ["xiaohongshu", "douyin"],
      reason: "问题与结果的对照可以转成复盘方法。",
    },
    {
      angleType: "commercial_experiment",
      title: "记录一次产品价值判断",
      coreIdea: `${eventCard.whyItMatters} 目前只记录已确认的结果：${eventCard.result}`,
      targetAudience: "关注中小企业产品和服务验证的人",
      recommendedPlatforms: ["x", "wechat_moments"],
      reason: "只讨论已确认事实，不延伸为商业成果。",
    },
  ];

  const candidatesBySignal = candidates.filter((candidate) => {
    if (candidate.angleType === "personal_growth") return contentScore.personal.score >= 4;
    if (candidate.angleType === "industry_observation") return contentScore.industry.score >= 4;
    if (candidate.angleType === "build_in_public") return contentScore.novelty.score >= 4;
    if (candidate.angleType === "practical_method") return contentScore.visual.score >= 4;
    return contentScore.business.score >= 4;
  });
  const minimum = contentScore.totalScore < 55 ? 2 : contentScore.totalScore >= 80 ? 3 : 3;
  const selected = [...candidatesBySignal];

  for (const candidate of candidates) {
    if (selected.length >= minimum) break;
    if (!selected.includes(candidate)) selected.push(candidate);
  }

  return selected.slice(0, contentScore.totalScore < 55 ? 2 : 5);
}
