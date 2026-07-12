import { factCheck } from "./fact-check.ts";
import type { SourceItem } from "../importers/types";

export type EventCardDraft = {
  projectId: string;
  sourceItemIds: string[];
  title: string;
  whatHappened: string;
  whyItMatters: string;
  problem: string;
  result: string;
  personalReflection: string;
  evidenceRequired: string;
  status: "inbox";
};

export type EventCardGenerationResult =
  | { valid: true; eventCard: EventCardDraft }
  | { valid: false; errors: string[] };

const headingAliases: Record<string, keyof Omit<EventCardDraft, "projectId" | "sourceItemIds" | "status">> = {
  发生了什么: "whatHappened",
  为什么重要: "whyItMatters",
  为什么做: "whyItMatters",
  问题: "problem",
  遇到问题: "problem",
  结果: "result",
  个人感受: "personalReflection",
  个人反思: "personalReflection",
};

function extractSections(content: string) {
  const sections: Record<string, string> = {};
  let currentHeading: string | undefined;
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/)?.[1]?.trim();

    if (heading) {
      currentHeading = heading;
      sections[currentHeading] = "";
      continue;
    }

    if (currentHeading) {
      sections[currentHeading] = `${sections[currentHeading]}${sections[currentHeading] ? "\n" : ""}${line}`;
    }
  }

  return sections;
}

function firstTitle(sourceItems: SourceItem[]) {
  for (const sourceItem of sourceItems) {
    const title = sourceItem.content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (title) return title;
  }

  return sourceItems[0]?.title ?? "未命名事件卡";
}

export function generateEventCard(sourceItems: SourceItem[]): EventCardGenerationResult {
  if (sourceItems.length === 0) {
    return { valid: false, errors: ["At least one SourceItem is required"] };
  }

  const projectIds = new Set(sourceItems.map((sourceItem) => sourceItem.projectId));
  if (projectIds.size !== 1 || sourceItems.some((sourceItem) => !sourceItem.projectId)) {
    return { valid: false, errors: ["All SourceItems must belong to one Project"] };
  }

  if (sourceItems.some((sourceItem) => !sourceItem.id)) {
    return { valid: false, errors: ["SourceItem ids are required for traceability"] };
  }

  const sections = sourceItems.reduce<Record<string, string>>((allSections, sourceItem) => {
    for (const [heading, content] of Object.entries(extractSections(sourceItem.content))) {
      const field = headingAliases[heading.replace(/[：:]/g, "")];
      if (field && !allSections[field] && content.trim()) {
        allSections[field] = content.trim();
      }
    }
    return allSections;
  }, {});

  const missingFields = [
    "whatHappened",
    "whyItMatters",
    "problem",
    "result",
    "personalReflection",
  ].filter((field) => !sections[field]);

  if (missingFields.length > 0) {
    return {
      valid: false,
      errors: missingFields.map((field) => `${field} is required`),
    };
  }

  const eventCard: EventCardDraft = {
    projectId: sourceItems[0].projectId,
    sourceItemIds: sourceItems.map((sourceItem) => sourceItem.id),
    title: firstTitle(sourceItems),
    whatHappened: sections.whatHappened,
    whyItMatters: sections.whyItMatters,
    problem: sections.problem,
    result: sections.result,
    personalReflection: sections.personalReflection,
    evidenceRequired: sourceItems.map((sourceItem) => sourceItem.id).join(", "),
    status: "inbox",
  };

  const factResult = factCheck(eventCard);
  if (!factResult.valid) {
    return { valid: false, errors: factResult.errors };
  }

  return { valid: true, eventCard };
}
