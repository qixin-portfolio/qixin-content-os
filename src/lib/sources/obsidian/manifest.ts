import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import type { TopicCandidateInput } from "./types.ts";
import { RISK_FLAGS } from "./types.ts";

const topicCandidateSchema = z.object({
  title: z.string().min(1),
  targetAudience: z.string().min(1),
  userPainPoint: z.string().min(1),
  coreAngle: z.string().min(1),
  relatedSourceRelativePaths: z.array(z.string().refine((value) => !isAbsolutePath(value))),
  evidenceStrength: z.enum(["strong", "medium", "weak"]),
  freshness: z.string().min(1),
  suggestedPlatforms: z.array(z.string()),
  riskFlags: z.array(z.enum(RISK_FLAGS)),
  status: z.enum(["proposed", "shortlisted", "rejected", "converted"]),
});

export const topicCandidatesManifestSchema = z.object({
  manifestVersion: z.literal("phase6a"),
  sourceCategory: z.literal("external_research"),
  factEligibility: z.literal("unverified_reference"),
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
    sourceCategory: "external_research",
    factEligibility: "unverified_reference",
    candidates,
  };
  topicCandidatesManifestSchema.parse(manifest);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function manifestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("~") || /^[A-Za-z]:[\\/]/.test(value);
}
