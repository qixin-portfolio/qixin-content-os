import type { MasterContent } from "../ai/content-generator";

export type PlatformVariants = {
  wechat: { title: string; body: string };
  x: { title: string; body: string };
  xiaohongshu: { title: string; body: string; tags: string[] };
  douyin: { hook: string; script: string };
};

export type EditorialPlatformVariants = {
  wechat_moments: { title: string; body: string; hook: string; cta: string };
  x: { title: string; body: string; hook: string; cta: string };
  xiaohongshu: { title: string; body: string; hook: string; cta: string };
  douyin: { title: string; body: string; hook: string; cta: string };
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

export function adaptMasterContentForEditorial(masterContent: MasterContent): EditorialPlatformVariants {
  const adapted = adaptMasterContent(masterContent);
  const parts = [masterContent.story, masterContent.insight, masterContent.reflection]
    .filter((part) => part.trim());
  const uniqueParts: string[] = [];
  for (const part of parts) {
    if (!uniqueParts.some((existing) => existing === part || existing.includes(part))) {
      uniqueParts.push(part);
    }
  }
  const body = uniqueParts.join("\n\n");

  return {
    wechat_moments: { title: adapted.wechat.title, body, hook: masterContent.hook, cta: masterContent.cta },
    x: { title: adapted.x.title, body, hook: masterContent.hook, cta: "" },
    xiaohongshu: { title: adapted.xiaohongshu.title, body, hook: masterContent.hook, cta: masterContent.cta },
    douyin: { title: masterContent.title, body, hook: adapted.douyin.hook, cta: masterContent.cta },
  };
}
