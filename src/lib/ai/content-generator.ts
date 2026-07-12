import { factCheck } from "../content/fact-check";

export type EventCard = {
  id: string;
  title: string;
  whatHappened: string;
  whyItMatters: string;
  problem: string;
  result: string;
  personalReflection: string;
  evidenceRequired: string;
  status: string;
};

export type MasterContent = {
  eventCardId: string;
  title: string;
  hook: string;
  story: string;
  insight: string;
  reflection: string;
  cta: string;
  status: string;
};

export function generateMasterContent(eventCard: EventCard): MasterContent {
  const result = factCheck(eventCard);

  if (!result.valid) {
    throw new Error(`Cannot generate content: ${result.errors.join(", ")}`);
  }

  return {
    eventCardId: eventCard.id,
    title: eventCard.title,
    hook: "这次先解决数据边界，再谈界面呈现。",
    story: `${eventCard.whatHappened}${eventCard.problem}${eventCard.result}`,
    insight: eventCard.whyItMatters,
    reflection: eventCard.personalReflection,
    cta: "你在做项目时，最先确认的是哪条数据边界？",
    status: "drafting",
  };
}
