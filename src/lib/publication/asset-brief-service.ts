export type PublicationAssetBrief = {
  recommendedAssetType: string[];
  purpose: string;
  requiredElements: string[];
  optionalElements: string[];
  avoidElements: string[];
  existingAssetIds: string[];
  missingAssets: string[];
  privacyRisks: string[];
  suggestedCount: number;
  suggestedAspectRatio: string[];
};

export function createAssetBrief(
  assets: Array<{ id: string; visibility: string; description: string | null }>,
): PublicationAssetBrief {
  const publishableAssets = assets.filter(({ visibility }) => visibility === "public");
  const privateAssetCount = assets.length - publishableAssets.length;
  return {
    recommendedAssetType: ["产品页面截图", "功能模块界面", "资料整理过程照片"],
    purpose: "用真实项目画面辅助读者理解资料整理进度，不把建议配图写成已有资产。",
    requiredElements: ["真实产品页面或真实资料整理现场", "不遮挡关键信息的清晰画面"],
    optionalElements: ["产品一页纸局部", "功能模块清单局部"],
    avoidElements: ["虚构客户截图", "虚构用户数据界面", "无法核验的上线或成交数据"],
    existingAssetIds: publishableAssets.map(({ id }) => id).sort(),
    missingAssets: publishableAssets.length === 0
      ? ["当前没有已确认可发布的真实项目截图"]
      : [],
    privacyRisks: [
      "检查客户姓名、电话、地址和聊天记录",
      "检查后台账号、密钥、内部链接和水印",
      ...(privateAssetCount > 0 ? [`${privateAssetCount} 个 Asset 尚未标记为公开可用`] : []),
    ],
    suggestedCount: 3,
    suggestedAspectRatio: ["1:1", "4:5"],
  };
}
