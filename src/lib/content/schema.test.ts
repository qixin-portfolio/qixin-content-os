import { describe, expect, it } from "vitest";
import { eventCardSchema, platformSchema } from "./schema";

const validEvent = {
  title: "透明工地完成权限加固",
  project: "透明工地小程序",
  happened: "针对 V1 授权和租户隔离完成了一轮安全加固。",
  motivation: "避免不同公司或角色看到不属于自己的数据。",
  problem: "原有权限判断需要覆盖更多入口和数据查询。",
  result: "相关修复已合并到项目仓库，但不等于已经商业化上线。",
  feeling: "界面不是第一风险，数据边界才是。",
  completionState: "tested",
  evidence: [{ label: "commit", reference: "5f4d942", approvedForPublication: true }],
};

describe("content schema", () => {
  it("accepts a complete evidence-backed event", () => {
    expect(eventCardSchema.parse(validEvent).completionState).toBe("tested");
  });

  it("rejects events without evidence", () => {
    expect(() => eventCardSchema.parse({ ...validEvent, evidence: [] })).toThrow();
  });

  it("rejects unsupported platforms", () => {
    expect(() => platformSchema.parse("wechat_official_account")).toThrow();
  });
});
