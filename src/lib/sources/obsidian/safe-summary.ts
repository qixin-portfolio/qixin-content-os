import { redactSensitiveText } from "./risk-detector.ts";

export const SAFE_SUMMARY_CONTENT_LIMIT = 180;
export const SAFE_SUMMARY_MAX_LENGTH = SAFE_SUMMARY_CONTENT_LIMIT + 1;

export function toSafeResearchSummary(value: string): string {
  const safe = redactSensitiveText(value).replace(/\s+/g, " ").trim();
  if (!safe) return "无可展示摘要";
  return `${safe.slice(0, SAFE_SUMMARY_CONTENT_LIMIT)}${safe.length > SAFE_SUMMARY_CONTENT_LIMIT ? "…" : ""}`;
}
