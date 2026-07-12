import { describe, expect, it } from "vitest";
import { importGitHubCommit } from "../../src/lib/importers/github";

const commitPayload = {
  sha: "abc123",
  html_url: "https://github.com/qixin-portfolio/qixin-content-os/commit/abc123",
  commit: {
    message: "feat: add import boundary",
  },
  files: [
    { filename: "src/lib/importers/markdown.ts", status: "added", additions: 24, deletions: 0 },
    { filename: "tests/import/markdown.test.ts", status: "added", additions: 12, deletions: 0 },
  ],
};

describe("importGitHubCommit", () => {
  it("imports only the requested commit and preserves its evidence URL", async () => {
    const fetcher: typeof fetch = async () =>
      new Response(JSON.stringify(commitPayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const source = await importGitHubCommit(
      { repository: "qixin-portfolio/qixin-content-os", commitSha: "abc123" },
      fetcher,
    );

    expect(source).toMatchObject({
      sourceType: "github",
      title: "feat: add import boundary",
      sourceUrl: commitPayload.html_url,
      sourcePath: "qixin-portfolio/qixin-content-os@abc123",
    });
    expect(source.content).toContain("commit message: feat: add import boundary");
    expect(source.content).toContain("src/lib/importers/markdown.ts");
  });

  it("returns a clear error when GitHub cannot provide the commit", async () => {
    const fetcher: typeof fetch = async () => new Response("Not found", { status: 404 });

    await expect(
      importGitHubCommit(
        { repository: "qixin-portfolio/qixin-content-os", commitSha: "missing" },
        fetcher,
      ),
    ).rejects.toThrow("GitHub commit lookup failed (404)");
  });
});
