import { afterEach, describe, expect, it } from "vitest";
import { getConfiguredObsidianVaultPath, loadTopicCandidatesManifestResult } from "../../src/lib/sources/obsidian/config";
import { readTopicCandidatesManifest, writeTopicCandidatesManifest } from "../../src/lib/sources/obsidian/manifest";
import { detectRiskFlags, redactSensitiveText } from "../../src/lib/sources/obsidian/risk-detector";
import type { TopicCandidateInput } from "../../src/lib/sources/obsidian/types";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Obsidian safety boundaries", () => {
  it("detects and redacts phone, WeChat and local path risks", () => {
    const unixPath = ["", "Users", "example", "private.md"].join("/");
    const windowsPath = ["C:", "Users", "example", "private.md"].join("\\");
    const body = `电话：13812345678；微信号：example_contact；路径 ${unixPath}；Windows ${windowsPath}`;
    const risks = detectRiskFlags({ relativePath: "note.md", body, attributes: {}, attachmentRefs: [] });
    expect(risks).toEqual(expect.arrayContaining(["phone_number", "wechat_contact", "local_absolute_path"]));
    const redacted = redactSensitiveText(body);
    expect(redacted).not.toContain("13812345678");
    expect(redacted).not.toContain("example_contact");
    expect(redacted).not.toContain(unixPath);
    expect(redacted).not.toContain(windowsPath);
  });

  it("quarantines and redacts high-confidence secrets", () => {
    const secret = `sk-${"A".repeat(24)}`;
    const body = `api_key=${secret}`;
    const risks = detectRiskFlags({ relativePath: "secret.md", body, attributes: {}, attachmentRefs: [] });
    expect(risks).toContain("secret_exposure");
    expect(redactSensitiveText(body)).not.toContain(secret);
  });

  it("validates a private topic manifest and rejects absolute source paths", () => {
    const root = mkdtempSync(join(tmpdir(), "qixin-manifest-test-"));
    const candidate: TopicCandidateInput = {
      title: "测试选题",
      targetAudience: "运营",
      userPainPoint: "资料散落",
      coreAngle: "先整理再研究",
      relatedSourceRelativePaths: ["2026/note.md"],
      evidenceStrength: "weak",
      freshness: "中",
      suggestedPlatforms: ["x"],
      riskFlags: ["copyright_risk"],
      status: "proposed",
    };
    const path = join(root, "manifest.json");
    writeTopicCandidatesManifest(path, [candidate]);
    expect(readTopicCandidatesManifest(path).candidates).toEqual([candidate]);
    for (const unsafePath of [
      ["", "Users", "example", "private.md"].join("/"),
      ["C:", "Users", "example", "private.md"].join("\\"),
      "../private.md",
      "folder/../../private.md",
      "folder\\..\\private.md",
      "\\\\server\\share\\private.md",
    ]) {
      expect(() => writeTopicCandidatesManifest(path, [{ ...candidate, relatedSourceRelativePaths: [unsafePath] }])).toThrow();
    }
    expect(() => writeTopicCandidatesManifest(path, [{ ...candidate, status: "shortlisted" as never }])).toThrow();
    expect(() => writeTopicCandidatesManifest(path, [{ ...candidate, suggestedPlatforms: ["unsupported" as never] }])).toThrow();
    rmSync(root, { recursive: true, force: true });
  });

  it("normalizes safe relative manifest paths", () => {
    const root = mkdtempSync(join(tmpdir(), "qixin-manifest-normalize-"));
    const path = join(root, "manifest.json");
    const candidate: TopicCandidateInput = {
      title: "规范路径",
      targetAudience: "运营",
      userPainPoint: "路径不统一",
      coreAngle: "只保存规范相对路径",
      relatedSourceRelativePaths: ["2026\\note.md"],
      evidenceStrength: "weak",
      freshness: "中",
      suggestedPlatforms: ["x"],
      riskFlags: [],
      status: "proposed",
    };
    writeTopicCandidatesManifest(path, [candidate]);
    expect(readTopicCandidatesManifest(path).candidates[0].relatedSourceRelativePaths).toEqual(["2026/note.md"]);
    rmSync(root, { recursive: true, force: true });
  });
});

const originalVaultPath = process.env.OBSIDIAN_RESEARCH_VAULT_PATH;
const originalManifestPath = process.env.TOPIC_CANDIDATES_MANIFEST_PATH;

afterEach(() => {
  if (originalVaultPath === undefined) delete process.env.OBSIDIAN_RESEARCH_VAULT_PATH;
  else process.env.OBSIDIAN_RESEARCH_VAULT_PATH = originalVaultPath;
  if (originalManifestPath === undefined) delete process.env.TOPIC_CANDIDATES_MANIFEST_PATH;
  else process.env.TOPIC_CANDIDATES_MANIFEST_PATH = originalManifestPath;
});

describe("Obsidian configuration", () => {
  it("only returns an explicitly configured Vault path", () => {
    delete process.env.OBSIDIAN_RESEARCH_VAULT_PATH;
    expect(getConfiguredObsidianVaultPath()).toBeUndefined();
    process.env.OBSIDIAN_RESEARCH_VAULT_PATH = "   ";
    expect(getConfiguredObsidianVaultPath()).toBeUndefined();
    const configuredPath = ["", "configured", "vault"].join("/");
    process.env.OBSIDIAN_RESEARCH_VAULT_PATH = configuredPath;
    expect(getConfiguredObsidianVaultPath()).toBe(configuredPath);
  });

  it("distinguishes an invalid private manifest from a missing manifest", () => {
    const root = mkdtempSync(join(tmpdir(), "qixin-invalid-manifest-"));
    const invalidPath = join(root, "invalid.json");
    writeFileSync(invalidPath, "{invalid", "utf8");
    process.env.TOPIC_CANDIDATES_MANIFEST_PATH = invalidPath;
    expect(loadTopicCandidatesManifestResult()).toEqual({ status: "invalid" });
    process.env.TOPIC_CANDIDATES_MANIFEST_PATH = join(root, "missing.json");
    expect(loadTopicCandidatesManifestResult()).toEqual({ status: "missing" });
    rmSync(root, { recursive: true, force: true });
  });
});
