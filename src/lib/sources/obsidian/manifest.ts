import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import type { TopicCandidateInput } from "./types.ts";
import { OBSIDIAN_FACT_ELIGIBILITY, OBSIDIAN_SOURCE_CATEGORY, RISK_FLAGS, TOPIC_PLATFORMS } from "./types.ts";

const relativePathSchema = z.string().min(1).superRefine((value, context) => {
  if (!normalizeVaultRelativePath(value)) context.addIssue({ code: "custom", message: "Expected a normalized Vault-relative path" });
}).transform((value) => normalizeVaultRelativePath(value)!);

const topicCandidateSchema = z.object({
  title: z.string().min(1),
  targetAudience: z.string().min(1),
  userPainPoint: z.string().min(1),
  coreAngle: z.string().min(1),
  relatedSourceRelativePaths: z.array(relativePathSchema),
  evidenceStrength: z.enum(["strong", "medium", "weak"]),
  freshness: z.string().min(1),
  suggestedPlatforms: z.array(z.enum(TOPIC_PLATFORMS)),
  riskFlags: z.array(z.enum(RISK_FLAGS)),
  status: z.literal("proposed"),
});

export const topicCandidatesManifestSchema = z.object({
  manifestVersion: z.literal("phase6a"),
  sourceCategory: z.literal(OBSIDIAN_SOURCE_CATEGORY),
  factEligibility: z.literal(OBSIDIAN_FACT_ELIGIBILITY),
  candidates: z.array(topicCandidateSchema),
});

export type TopicCandidatesManifest = {
  manifestVersion: "phase6a";
  sourceCategory: "external_research";
  factEligibility: "unverified_reference";
  candidates: TopicCandidateInput[];
};

export function readTopicCandidatesManifest(path: string): TopicCandidatesManifest {
  return topicCandidatesManifestSchema.parse(JSON.parse(readFileSync(path, "utf8"))) as TopicCandidatesManifest;
}

export function writeTopicCandidatesManifest(path: string, candidates: TopicCandidateInput[]) {
  const manifest: TopicCandidatesManifest = {
    manifestVersion: "phase6a",
    sourceCategory: OBSIDIAN_SOURCE_CATEGORY,
    factEligibility: OBSIDIAN_FACT_ELIGIBILITY,
    candidates,
  };
  const normalized = topicCandidatesManifestSchema.parse(manifest);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

export function manifestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function normalizeVaultRelativePath(value: string): string | null {
  const slashPath = value.trim().normalize("NFC").replace(/\\/g, "/");
  if (!slashPath || slashPath.startsWith("/") || slashPath.startsWith("~") || /^[A-Za-z]:\//.test(slashPath) || slashPath.includes("\0")) return null;
  const segments = slashPath.split("/");
  if (segments.includes("..")) return null;
  const normalized = segments.filter((segment) => segment && segment !== ".").join("/");
  return normalized || null;
}
