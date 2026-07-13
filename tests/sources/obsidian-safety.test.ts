import { describe, expect, it } from "vitest";
import { readTopicCandidatesManifest, writeTopicCandidatesManifest } from "../../src/lib/sources/obsidian/manifest";
import { detectRiskFlags, redactSensitiveText } from "../../src/lib/sources/obsidian/risk-detector";
import type { TopicCandidateInput } from "../../src/lib/sources/obsidian/types";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Obsidian safety boundaries", () => {
  it("detects and redacts phone, WeChat and local path risks", () => {
    const body = "电话：13812345678；微信号：qixin_test；路径 /Users/qixin/private.md";
    const risks = detectRiskFlags({ relativePath: "note.md", body, attributes: {}, attachmentRefs: [] });
    expect(risks).toEqual(expect.arrayContaining(["phone_number", "wechat_contact", "local_absolute_path"]));
    const redacted = redactSensitiveText(body);
    expect(redacted).not.toContain("13812345678");
    expect(redacted).not.toContain("qixin_test");
    expect(redacted).not.toContain("/Users/qixin");
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
    expect(() => writeTopicCandidatesManifest(path, [{ ...candidate, relatedSourceRelativePaths: ["/Users/qixin/private.md"] }])).toThrow();
    rmSync(root, { recursive: true, force: true });
  });
});
