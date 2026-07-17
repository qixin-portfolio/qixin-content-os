import { existsSync, lstatSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { RadarConfig } from "./types.ts";

function isInside(parent: string, candidate: string) {
  const nested = relative(parent, candidate);
  return nested === "" || (!nested.startsWith("..") && !isAbsolute(nested));
}

function rejectSymlinks(root: string, candidate: string) {
  const suffix = relative(root, candidate);
  const parts = suffix ? suffix.split(sep) : [];
  let current = root;
  if (lstatSync(current).isSymbolicLink()) throw new Error("symlink paths are not allowed");
  for (const part of parts) {
    current = resolve(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error("symlink paths are not allowed");
  }
}

export function resolveAllowedRoot(config: RadarConfig, allowedRoot: string) {
  if (!config.allowedRoots.includes(allowedRoot)) throw new Error("path is outside allowed roots");
  const candidate = resolve(config.vaultPath, allowedRoot);
  if (!isInside(config.vaultPath, candidate) || !existsSync(candidate)) throw new Error("path is outside allowed roots");
  rejectSymlinks(config.vaultPath, candidate);
  const resolved = realpathSync(candidate);
  if (!isInside(config.vaultPath, resolved)) throw new Error("path is outside allowed roots");
  return resolved;
}

export function resolveMaterialPath(config: RadarConfig, relativePath: string) {
  if (!relativePath || isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) {
    throw new Error("path is outside allowed roots");
  }
  const normalized = relativePath.replaceAll("\\", "/");
  const allowedRoot = config.allowedRoots.find((root) => normalized === root || normalized.startsWith(`${root}/`));
  if (!allowedRoot) throw new Error("path is outside allowed roots");
  const root = resolveAllowedRoot(config, allowedRoot);
  const pathWithinRoot = normalized === allowedRoot ? "" : normalized.slice(allowedRoot.length + 1);
  const candidate = resolve(root, pathWithinRoot);
  if (!isInside(root, candidate)) throw new Error("path is outside allowed roots");
  rejectSymlinks(root, candidate);
  return candidate;
}
