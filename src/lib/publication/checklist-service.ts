import type { PrismaClient } from "@prisma/client";

export type ChecklistItem = {
  id: string;
  label: string;
  kind: "automatic" | "manual";
  completed: boolean;
  detail: string;
};

export type PublicationChecklist = {
  items: ChecklistItem[];
};

type ChecklistInput = {
  approved: boolean;
  revisionMatches: boolean;
  evidenceSourceCount: number;
  finalText: string;
};

function hasUnverifiedLaunchClaim(text: string) {
  return /已(?:经)?正式上线|现已上线|成功上线/.test(text);
}

function hasUnverifiedCustomerClaim(text: string) {
  return /已有客户|获得客户|客户已经(?:使用|购买|签约)/.test(text);
}

function hasUserCountClaim(text: string) {
  return /用户(?:数|数量)?\s*(?:达到|超过|已有|突破|为)\s*\d|\d+\s*名?用户/.test(text);
}

function hasRevenueClaim(text: string) {
  return /(?:收入|营收|成交额)\s*(?:达到|超过|突破|为)\s*\d|年入\s*\d/.test(text);
}

export function createPublishChecklist(input: ChecklistInput): PublicationChecklist {
  return {
    items: [
      {
        id: "copy_approved",
        label: "文案已人工批准",
        kind: "automatic",
        completed: input.approved,
        detail: input.approved ? "EditorialDraft 状态为 approved。" : "EditorialDraft 尚未批准。",
      },
      {
        id: "revision_matches",
        label: "最终正文与 approved Revision 一致",
        kind: "automatic",
        completed: input.revisionMatches,
        detail: input.revisionMatches ? "标题、Hook、正文和 CTA 一致。" : "批准链文本不一致。",
      },
      {
        id: "evidence_complete",
        label: "事实来源完整",
        kind: "automatic",
        completed: input.evidenceSourceCount > 0,
        detail: `证据快照包含 ${input.evidenceSourceCount} 条 SourceItem。`,
      },
      {
        id: "no_launch_claim",
        label: "无未证实上线声明",
        kind: "automatic",
        completed: !hasUnverifiedLaunchClaim(input.finalText),
        detail: "检测已正式上线、成功上线等肯定性表述。",
      },
      {
        id: "no_customer_claim",
        label: "无未证实客户声明",
        kind: "automatic",
        completed: !hasUnverifiedCustomerClaim(input.finalText),
        detail: "检测已有客户、签约或购买等肯定性表述。",
      },
      {
        id: "no_user_count_claim",
        label: "无用户数量声明",
        kind: "automatic",
        completed: !hasUserCountClaim(input.finalText),
        detail: "检测带具体数量或增长结果的用户声明。",
      },
      {
        id: "no_revenue_claim",
        label: "无收入声明",
        kind: "automatic",
        completed: !hasRevenueClaim(input.finalText),
        detail: "检测收入、营收、成交额等量化结果。",
      },
      {
        id: "privacy_checked",
        label: "已检查隐私信息",
        kind: "manual",
        completed: false,
        detail: "由用户检查正文和素材中的私人信息。",
      },
      {
        id: "real_assets_selected",
        label: "已选择真实配图",
        kind: "manual",
        completed: false,
        detail: "由用户选择真实、可公开的配图。",
      },
      {
        id: "image_privacy_checked",
        label: "已检查图片水印和客户信息",
        kind: "manual",
        completed: false,
        detail: "由用户检查图片水印、客户姓名、电话和地址。",
      },
      {
        id: "manual_preview",
        label: "已人工预览",
        kind: "manual",
        completed: false,
        detail: "由用户按平台实际展示方式预览。",
      },
      {
        id: "publish_time_confirmed",
        label: "已确认发布时间",
        kind: "manual",
        completed: false,
        detail: "由用户确认计划或实际发布时间。",
      },
    ],
  };
}

export function parsePublishChecklist(value: string): PublicationChecklist {
  const parsed = JSON.parse(value) as PublicationChecklist;
  if (!Array.isArray(parsed.items)) throw new Error("Invalid publication checklist");
  return parsed;
}

export async function updateManualChecklist(
  prisma: PrismaClient,
  publicationPackageId: string,
  completedItemIds: string[],
) {
  const publicationPackage = await prisma.publicationPackage.findUniqueOrThrow({
    where: { id: publicationPackageId },
  });
  const checklist = parsePublishChecklist(publicationPackage.publishChecklistJson);
  const manualIds = new Set(
    checklist.items.filter(({ kind }) => kind === "manual").map(({ id }) => id),
  );
  const requestedIds = new Set(completedItemIds);
  for (const itemId of requestedIds) {
    if (!manualIds.has(itemId)) throw new Error(`Unknown manual checklist item: ${itemId}`);
  }
  const updated: PublicationChecklist = {
    items: checklist.items.map((item) => item.kind === "manual"
      ? { ...item, completed: requestedIds.has(item.id) }
      : item),
  };
  return prisma.publicationPackage.update({
    where: { id: publicationPackageId },
    data: { publishChecklistJson: JSON.stringify(updated) },
  });
}
