import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/create/session", async () => (
  import("../../src/lib/create/session")
));
import { CreateWorkbench } from "../../src/app/create/create-workbench";

describe("/create page contract", () => {
  it("renders the three understandable entry points and honest X empty state", () => {
    const html = renderToStaticMarkup(<CreateWorkbench recentProjects={[]} demoProject={null} />);

    expect(html).toContain("今天想写点什么？");
    expect(html).toContain("记录今天发生的事");
    expect(html).toContain("从最近项目里选");
    expect(html).toContain("从 X 收藏中找灵感");
    expect(html).toContain("X 收藏研究库尚未接入当前版本");
    expect(html).toContain("查看流程演示");
    expect(html).not.toContain("透明工地资料整理");
  });

  it("does not expose engineering identifiers or scoring language", () => {
    const html = renderToStaticMarkup(<CreateWorkbench recentProjects={[]} demoProject={null} />);

    expect(html).not.toMatch(/SourceItem|Revision|packageHash|evidenceSnapshot|authenticityScore|aiToneScore/);
  });
});
