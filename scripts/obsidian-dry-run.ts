import { existsSync } from "node:fs";
import { getTopicCandidatesManifestPath } from "../src/lib/sources/obsidian/config.ts";
import { readTopicCandidatesManifest } from "../src/lib/sources/obsidian/manifest.ts";
import { scanObsidianVault } from "../src/lib/sources/obsidian/scanner.ts";

const vaultPath = process.env.OBSIDIAN_RESEARCH_VAULT_PATH?.trim();
if (!vaultPath) throw new Error("OBSIDIAN_RESEARCH_VAULT_PATH is required; dry-run never stores the path");

const scan = scanObsidianVault(vaultPath);
const manifestPath = getTopicCandidatesManifestPath();
const topicCandidates = existsSync(manifestPath) ? readTopicCandidatesManifest(manifestPath).candidates.length : 0;
console.log(JSON.stringify({
  vaultKey: scan.vaultKey,
  displayName: scan.displayName,
  discovered: scan.discoveredCount,
  valid: scan.validCount,
  skipped: scan.skippedCount,
  duplicate: scan.duplicateCount,
  quarantined: scan.quarantinedCount,
  sourceItemCandidates: scan.sourceItemCandidates,
  topicCandidates,
  missingSource: scan.missingSource,
  brokenLinks: scan.brokenLinks,
  missingAttachments: scan.missingAttachments,
  riskCount: scan.riskCount,
  manifestHash: scan.manifestHash,
  quarantinedPaths: scan.notes.filter((note) => note.isQuarantined).map((note) => ({ relativePath: note.relativePath, riskFlags: note.riskFlags })),
  dryRun: true,
}, null, 2));
