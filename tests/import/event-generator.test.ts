import { describe, expect, it } from "vitest";
import { generateEventCard } from "../../src/lib/content/event-generator";
import type { SourceItem } from "../../src/lib/importers/types";

const completeSource: SourceItem = {
  id: "source-1",
  projectId: "project-1",
  sourceType: "markdown",
  title: "透明工地项目总结",
  content: [
    "# 透明工地资料整理",
    "",
    "## 发生了什么",
    "已形成产品一页纸、功能模块清单和行业案例说明。",
    "",
    "## 为什么重要",
    "需要把已有材料和待补证据分开管理。",
    "",
    "## 遇到问题",
    "当前缺少截图、后台版本记录、代码路径和真实项目案例。",
    "",
    "## 结果",
    "目前只能确认产品文档已形成，不能确认上线、客户、用户数量或收入。",
    "",
    "## 个人感受",
    "先保留证据缺口，比把产品规划写成已发生结果更重要。",
  ].join("\n"),
  visibility: "private",
};

describe("generateEventCard", () => {
  it("generates an EventCard draft linked to every SourceItem", () => {
    const result = generateEventCard([completeSource]);

    expect(result).toEqual({
      valid: true,
      eventCard: {
        projectId: "project-1",
        sourceItemIds: ["source-1"],
        title: "透明工地资料整理",
        whatHappened: "已形成产品一页纸、功能模块清单和行业案例说明。",
        whyItMatters: "需要把已有材料和待补证据分开管理。",
        problem: "当前缺少截图、后台版本记录、代码路径和真实项目案例。",
        result: "目前只能确认产品文档已形成，不能确认上线、客户、用户数量或收入。",
        personalReflection: "先保留证据缺口，比把产品规划写成已发生结果更重要。",
        evidenceRequired: "source-1",
        status: "inbox",
      },
    });
  });

  it("returns validation errors when evidence is missing", () => {
    const incomplete = { ...completeSource, content: "# 只有标题" };

    expect(generateEventCard([incomplete])).toEqual({
      valid: false,
      errors: [
        "whatHappened is required",
        "whyItMatters is required",
        "problem is required",
        "result is required",
        "personalReflection is required",
      ],
    });
  });

  it("rejects an empty SourceItem collection", () => {
    expect(generateEventCard([])).toEqual({
      valid: false,
      errors: ["At least one SourceItem is required"],
    });
  });
});
