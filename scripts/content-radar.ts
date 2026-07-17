import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { validateRadarConfig } from "../src/lib/content-radar/config.ts";
import { readIndex, writeIndex } from "../src/lib/content-radar/index-store.ts";
import { jsonOutput } from "../src/lib/content-radar/output.ts";
import { scanMaterials } from "../src/lib/content-radar/scanner.ts";
import { searchMaterials } from "../src/lib/content-radar/search.ts";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function defaultConfigPath() {
  const home = process.env.HOME;
  if (!home) throw new Error("HOME is required to locate content radar configuration");
  return `${home}/.hermes/data/qixin-content-radar/config.json`;
}

function numberOption(name: string, fallback: number) {
  const value = option(name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function configuration() {
  const configPath = resolve(option("--config") || defaultConfigPath());
  if (!existsSync(configPath)) throw new Error("content radar configuration is missing");
  const config = validateRadarConfig(JSON.parse(readFileSync(configPath, "utf8")));
  return { config, configPath };
}

function indexPath(configPath: string) {
  return resolve(option("--index") || `${dirname(configPath)}/index.json`);
}

function main() {
  const command = process.argv[2];
  const { config, configPath } = configuration();
  const targetIndexPath = indexPath(configPath);

  if (command === "scan") {
    const result = scanMaterials(config, readIndex(targetIndexPath));
    writeIndex(targetIndexPath, result.index);
    process.stdout.write(`${jsonOutput(result.summary)}\n`);
    return;
  }

  if (command === "search") {
    const query = option("--query");
    if (!query?.trim()) throw new Error("--query is required");
    const results = searchMaterials(readIndex(targetIndexPath), query, numberOption("--limit", 10));
    process.stdout.write(`${jsonOutput({ query, results })}\n`);
    return;
  }

  throw new Error("usage: content-radar.ts <scan|search> [--config path] [--index path]");
}

try {
  main();
} catch (error) {
  process.stderr.write(`content-radar: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
}
