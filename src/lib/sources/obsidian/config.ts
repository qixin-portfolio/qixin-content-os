import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readTopicCandidatesManifest } from "./manifest.ts";

export function getConfiguredObsidianVaultPath(): string | undefined {
  const value = process.env.OBSIDIAN_RESEARCH_VAULT_PATH?.trim();
  return value || undefined;
}

export function getTopicCandidatesManifestPath(): string {
  return process.env.TOPIC_CANDIDATES_MANIFEST_PATH?.trim()
    || join(homedir(), "Documents", "qixin-content-os-private-backups", "import-manifests", "topic-candidates-phase6a.json");
}

export function loadTopicCandidatesManifest() {
  const result = loadTopicCandidatesManifestResult();
  return result.status === "loaded" ? result.manifest : null;
}

export function loadTopicCandidatesManifestResult():
  | { status: "loaded"; manifest: ReturnType<typeof readTopicCandidatesManifest> }
  | { status: "missing" | "invalid" } {
  const path = getTopicCandidatesManifestPath();
  if (!existsSync(path)) return { status: "missing" };
  try {
    return { status: "loaded", manifest: readTopicCandidatesManifest(path) };
  } catch {
    return { status: "invalid" };
  }
}
