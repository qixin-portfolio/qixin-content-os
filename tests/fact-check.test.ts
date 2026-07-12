import { describe, expect, it } from "vitest";
import { factCheck } from "../src/lib/content/fact-check";

const completeEvent = {
  title: "透明工地完成权限加固",
  whatHappened: "完成了项目权限边界的加固，并补充了关键入口的检查。",
  whyItMatters: "避免不同角色看到不属于自己的数据。",
  problem: "原有权限判断没有覆盖所有数据查询入口。",
  result: "修复已合并到项目仓库，尚未声明为正式上线。",
  personalReflection: "数据边界比界面装饰更值得优先确认。",
  evidenceRequired: "commit 5f4d942 和对应的代码变更记录",
};

describe("factCheck", () => {
  it("rejects an event without evidence", () => {
    const result = factCheck({ ...completeEvent, evidenceRequired: "" });

    expect(result).toEqual({
      valid: false,
      errors: ["evidenceRequired is required"],
    });
  });

  it("rejects an event without a result or personal reflection", () => {
    const result = factCheck({ ...completeEvent, result: "", personalReflection: "" });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      "result is required",
      "personalReflection is required",
    ]);
  });

  it("accepts a complete event", () => {
    expect(factCheck(completeEvent)).toEqual({ valid: true, errors: [] });
  });
});
