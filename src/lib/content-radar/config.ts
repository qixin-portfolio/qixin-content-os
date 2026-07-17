import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { RadarConfig } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function strings(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${field} must be an array of strings`);
  }
  return value.map((entry) => entry.trim()).filter(Boolean);
}

function isInside(parent: string, candidate: string) {
  const nested = relative(parent, candidate);
  return nested === "" || (!nested.startsWith("..") && !isAbsolute(nested));
}

export function validateRadarConfig(input: unknown): RadarConfig {
  if (!isRecord(input)) throw new Error("configuration is required");
  if (typeof input.vaultPath !== "string" || !input.vaultPath.trim()) throw new Error("vaultPath is required");
  if (!existsSync(input.vaultPath)) throw new Error("vaultPath does not exist");

  const vaultPath = realpathSync(input.vaultPath);
  const allowedRoots = strings(input.allowedRoots, "allowedRoots");
  if (allowedRoots.length === 0) throw new Error("allowedRoots must not be empty");
  const ignoredPatterns = input.ignoredPatterns === undefined ? [] : strings(input.ignoredPatterns, "ignoredPatterns");
  const maxFileSizeBytes = typeof input.maxFileSizeBytes === "number" ? input.maxFileSizeBytes : 102400;
  if (!Number.isInteger(maxFileSizeBytes) || maxFileSizeBytes <= 0) throw new Error("maxFileSizeBytes must be a positive integer");

  for (const allowedRoot of allowedRoots) {
    if (isAbsolute(allowedRoot) || allowedRoot.split(/[\\/]/).includes("..")) {
      throw new Error("allowedRoot escapes vaultPath");
    }
    if (!isInside(vaultPath, resolve(vaultPath, allowedRoot))) throw new Error("allowedRoot escapes vaultPath");
  }

  return { vaultPath, allowedRoots, ignoredPatterns, maxFileSizeBytes };
}
