import type { MasterContent } from "../ai/content-generator";

export type PlatformVariants = {
  wechat: { title: string; body: string };
  x: { title: string; body: string };
  xiaohongshu: { title: string; body: string; tags: string[] };
  douyin: { hook: string; script: string };
};

export function adaptMasterContent(masterContent: MasterContent): PlatformVariants {
  const body = [
    masterContent.story,
    masterContent.insight,
    masterContent.reflection,
  ].join("\n\n");

  return {
    wechat: {
      title: masterContent.title,
      body: `${masterContent.hook}\n\n${body}\n\n${masterContent.cta}`,
    },
    x: {
      title: masterContent.title,
      body: `${masterContent.hook} ${body}`,
    },
    xiaohongshu: {
      title: masterContent.title,
      body: `${masterContent.hook}\n\n${body}\n\n${masterContent.cta}`,
      tags: ["#项目记录", "#事实复盘", "#内容创作"],
    },
    douyin: {
      hook: masterContent.hook,
      script: `${body}\n\n${masterContent.cta}`,
    },
  };
}
