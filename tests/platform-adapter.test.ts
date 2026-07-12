import { describe, expect, it } from "vitest";
import { generateMasterContent } from "../src/lib/ai/content-generator";
import { adaptMasterContent, adaptMasterContentForEditorial } from "../src/lib/content/platform-adapter";

const eventCard = {
  id: "event-1",
  title: "透明工地完成权限加固",
  whatHappened: "完成了项目权限边界的加固，并补充了关键入口的检查。",
  whyItMatters: "避免不同角色看到不属于自己的数据。",
  problem: "原有权限判断没有覆盖所有数据查询入口。",
  result: "修复已合并到项目仓库，尚未声明为正式上线。",
  personalReflection: "数据边界比界面装饰更值得优先确认。",
  evidenceRequired: "commit 5f4d942 和对应的代码变更记录",
  status: "inbox",
};

describe("adaptMasterContent", () => {
  it("creates independent editorial platform shapes without changing facts", () => {
    const variants = adaptMasterContentForEditorial(generateMasterContent(eventCard));

    expect(Object.keys(variants)).toEqual(["wechat_moments", "x", "xiaohongshu", "douyin"]);
    expect(variants.wechat_moments.hook).toBe(eventCard.title ? "这次先解决数据边界，再谈界面呈现。" : "");
    expect(variants.x.body).toContain(eventCard.result);
    expect(variants.xiaohongshu.body).toContain(eventCard.personalReflection);
    expect(variants.douyin.body).toContain(eventCard.result);
    expect(variants.douyin.body.match(/数据边界比界面装饰更值得优先确认/g)).toHaveLength(1);
  });

  it("creates the four requested platform shapes", () => {
    const variants = adaptMasterContent(generateMasterContent(eventCard));

    expect(Object.keys(variants)).toEqual(["wechat", "x", "xiaohongshu", "douyin"]);
    expect(variants.xiaohongshu.tags.length).toBeGreaterThan(0);
    expect(variants.douyin.hook).toBeTruthy();
    expect(variants.douyin.script).toContain(eventCard.result);
  });

  it("keeps source facts unchanged in every platform body", () => {
    const variants = adaptMasterContent(generateMasterContent(eventCard));
    const bodies = [
      variants.wechat.body,
      variants.x.body,
      variants.xiaohongshu.body,
      variants.douyin.script,
    ];

    for (const body of bodies) {
      expect(body).toContain(eventCard.whatHappened);
      expect(body).toContain(eventCard.result);
      expect(body).toContain(eventCard.personalReflection);
    }
  });
});
