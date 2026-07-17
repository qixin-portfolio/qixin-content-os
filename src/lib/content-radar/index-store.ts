import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { MaterialIndex } from "./types.ts";

export function emptyIndex(): MaterialIndex {
  return { version: 1, parserVersion: 2, items: [] };
}

export function readIndex(indexPath: string): MaterialIndex {
  if (!existsSync(indexPath)) return emptyIndex();
  const parsed = JSON.parse(readFileSync(indexPath, "utf8")) as Partial<MaterialIndex>;
  if (parsed.version !== 1 || !Array.isArray(parsed.items)) throw new Error("invalid content radar index");
  return { version: 1, parserVersion: parsed.parserVersion === 2 ? 2 : undefined, items: parsed.items };
}

export function writeIndex(indexPath: string, index: MaterialIndex) {
  mkdirSync(dirname(indexPath), { recursive: true });
  const temporaryPath = `${indexPath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, indexPath);
}
