import type { SourceItem } from "../../src/lib/importers/types";

export const realEvent = {
  id: "event-real-1",
  projectId: "project-transparent",
  title: "透明工地资料整理",
  whatHappened: "已完成真实项目资料整理，并建立了产品文档和来源素材之间的关联。",
  whyItMatters: "装修行业需要把施工过程和信任问题转成可追溯的产品资产。",
  problem: "当前缺少截图、后台版本记录、代码路径和真实项目案例。",
  result: "产品文档已形成，发布状态、客户、用户数量和收入仍不能确认。",
  personalReflection: "我决定先保留证据缺口，优先把事实和待补材料分开。",
  evidenceRequired: "source-real-1, source-real-2, source-real-3, source-real-4",
  status: "inbox",
};

export const realSources: SourceItem[] = [
  { id: "source-real-1", projectId: realEvent.projectId, sourceType: "markdown", title: "README", content: "# README", visibility: "private" },
  { id: "source-real-2", projectId: realEvent.projectId, sourceType: "markdown", title: "项目总结", content: "# 项目总结", visibility: "private" },
  { id: "source-real-3", projectId: realEvent.projectId, sourceType: "document", title: "产品一页纸", content: "# 产品一页纸", visibility: "private" },
  { id: "source-real-4", projectId: realEvent.projectId, sourceType: "github", title: "commit", content: "commit message: add evidence boundary", visibility: "private" },
];

export const ordinaryBugEvent = {
  ...realEvent,
  id: "event-bug-1",
  title: "修复一个常规按钮 bug",
  whatHappened: "修复了一个按钮点击后的报错。",
  whyItMatters: "避免用户继续看到这个报错。",
  problem: "一个按钮在特定输入下会报错。",
  result: "修复已通过本地测试。",
  personalReflection: "记录一下这个修复。",
  evidenceRequired: "source-bug-1",
};

export const ordinaryBugSources: SourceItem[] = [
  { id: "source-bug-1", projectId: ordinaryBugEvent.projectId, sourceType: "document", title: "测试记录", content: "# 测试记录", visibility: "private" },
];
