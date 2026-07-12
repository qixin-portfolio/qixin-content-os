import { describe, expect, it } from "vitest";
import { generateMasterContent } from "../src/lib/ai/content-generator";

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

describe("generateMasterContent", () => {
  it("creates a stable master draft from a complete event", () => {
    expect(generateMasterContent(eventCard)).toEqual({
      eventCardId: "event-1",
      title: "透明工地完成权限加固",
      hook: "这次先解决数据边界，再谈界面呈现。",
      story: "完成了项目权限边界的加固，并补充了关键入口的检查。原有权限判断没有覆盖所有数据查询入口。修复已合并到项目仓库，尚未声明为正式上线。",
      insight: "避免不同角色看到不属于自己的数据。",
      reflection: "数据边界比界面装饰更值得优先确认。",
      cta: "你在做项目时，最先确认的是哪条数据边界？",
      status: "drafting",
    });
  });

  it("does not create a draft for an event without evidence", () => {
    expect(() => generateMasterContent({ ...eventCard, evidenceRequired: "" })).toThrow(
      "Cannot generate content: evidenceRequired is required",
    );
  });
});
