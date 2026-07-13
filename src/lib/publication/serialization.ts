import { createHash } from "node:crypto";

function normalizeForSerialization(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForSerialization);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeForSerialization(item)]),
    );
  }
  return value;
}

export function stableJson(value: unknown) {
  return JSON.stringify(normalizeForSerialization(value));
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
