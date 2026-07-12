import type { SourceItemDraft } from "./types";

type GitHubCommitInput = {
  repository: string;
  commitSha: string;
};

type GitHubCommitResponse = {
  sha?: unknown;
  html_url?: unknown;
  commit?: { message?: unknown };
  files?: unknown;
};

type GitHubFile = {
  filename?: unknown;
  status?: unknown;
  additions?: unknown;
  deletions?: unknown;
};

export async function importGitHubCommit(
  input: GitHubCommitInput,
  fetcher: typeof fetch = fetch,
): Promise<SourceItemDraft> {
  if (!/^[^/]+\/[^/]+$/.test(input.repository)) {
    throw new Error("repository must use the owner/name format");
  }

  if (!input.commitSha.trim()) {
    throw new Error("commitSha is required");
  }

  const response = await fetcher(
    `https://api.github.com/repos/${input.repository}/commits/${input.commitSha}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `GitHub commit lookup failed (${response.status}) for ${input.repository}@${input.commitSha}`,
    );
  }

  const payload = (await response.json()) as GitHubCommitResponse;
  const message = typeof payload.commit?.message === "string" ? payload.commit.message.trim() : "";
  const htmlUrl = typeof payload.html_url === "string" ? payload.html_url : "";
  const files = Array.isArray(payload.files) ? (payload.files as GitHubFile[]) : [];

  if (!message) {
    throw new Error("GitHub response is missing the commit message");
  }

  if (!htmlUrl) {
    throw new Error("GitHub response is missing the commit URL");
  }

  if (files.length === 0) {
    throw new Error("GitHub response is missing changed files");
  }

  const changedFiles = files.map((file) => {
    const filename = typeof file.filename === "string" ? file.filename : "";
    const status = typeof file.status === "string" ? file.status : "unknown";

    if (!filename) {
      throw new Error("GitHub response contains a changed file without a filename");
    }

    const additions = typeof file.additions === "number" ? ` +${file.additions}` : "";
    const deletions = typeof file.deletions === "number" ? ` -${file.deletions}` : "";
    return `- ${status}: ${filename}${additions}${deletions}`;
  });

  return {
    sourceType: "github",
    title: message.split("\n")[0],
    content: [
      `commit message: ${message}`,
      `commit sha: ${input.commitSha}`,
      `repository: ${input.repository}`,
      "changed files:",
      ...changedFiles,
    ].join("\n"),
    sourceUrl: htmlUrl,
    sourcePath: `${input.repository}@${input.commitSha}`,
    repository: input.repository,
    visibility: "private",
  };
}
