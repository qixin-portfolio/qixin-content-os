import type { FrontmatterValue } from "./frontmatter";
import { RISK_FLAGS, type RiskFlag } from "./types.ts";

export const AUDIT_QUARANTINE_PATHS: Record<string, RiskFlag[]> = {
  "images/b5a28c03349a252486728d14c15271b9_MD5.jpg": ["phone_number"],
  "2026/06/一人公司正在爆发，30s就能用码上飞开一个AI小店了。.md": ["phone_number"],
  "2026/07/电商×AI落地指南：一篇讲透 ——6大场景逐个拆，帮你避坑省百万.md": ["wechat_contact"],
  "2026/06/AI Agent 最大的问题不是不聪明，是它总从零开始：我把 EverOS 跑了一遍 .md": ["local_absolute_path"],
  "2026/07/人人都可以搞懂并且一键配置的Codex记忆系统！（小白理解友好）.md": ["local_absolute_path"],
  "2026/07/当我不小心把 CodeX 和 Claude code合并后，结果让我出乎意外.md": ["local_absolute_path"],
};

export const QUARANTINE_FLAGS = new Set<RiskFlag>([
  "phone_number",
  "wechat_contact",
  "local_absolute_path",
  "secret_exposure",
  "customer_privacy",
]);

export function detectRiskFlags(input: {
  relativePath: string;
  body: string;
  attributes: Record<string, FrontmatterValue>;
  attachmentRefs: string[];
}): RiskFlag[] {
  const risks = new Set<RiskFlag>(AUDIT_QUARANTINE_PATHS[input.relativePath] ?? []);
  const text = `${input.relativePath}\n${input.body}\n${Object.values(input.attributes).join(" ")}`;
  const separatedPhone = /(?<![\d-])1[3-9]\d[\s-]\d{4}[\s-]\d{4}(?!\d)/.test(text);
  const contextualPhone = /(?:电话|手机|联系方式|tel|phone)[^\d]{0,8}1[3-9]\d{9}(?!\d)/i.test(text);
  if (separatedPhone || contextualPhone || input.attachmentRefs.some((ref) => AUDIT_QUARANTINE_PATHS[ref]?.includes("phone_number"))) {
    risks.add("phone_number");
  }
  if (/(?:微信号|微信联系方式|添加微信|加微信|\bvx\b|v信)\s*[:：]?\s*[a-z0-9_-]{3,}/i.test(text)) risks.add("wechat_contact");
  if (input.attachmentRefs.some((ref) => Object.entries(AUDIT_QUARANTINE_PATHS).some(([path, flags]) => ref === path || ref.endsWith(`/${path}`) && flags.includes("phone_number")))) risks.add("phone_number");
  if (/(?:\/Users\/|\/home\/|~\/|[A-Z]:\\\\|\\\\Users\\\\)/.test(text)) risks.add("local_absolute_path");
  if (hasHighConfidenceSecret(text)) risks.add("secret_exposure");
  if (/(?:客户|业主)(?:姓名|住址|地址|身份证号|银行卡号)\s*[:：]\s*\S{2,}/.test(text)) risks.add("customer_privacy");
  if (!input.body.trim()) risks.add("unknown_source");
  return RISK_FLAGS.filter((flag) => risks.has(flag));
}

export function isQuarantined(riskFlags: RiskFlag[]): boolean {
  return riskFlags.some((flag) => QUARANTINE_FLAGS.has(flag));
}

export function redactSensitiveText(text: string): string {
  return text
    .replace(/1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}/g, "[联系方式已脱敏]")
    .replace(/(?:微信|微信号|vx|v信|wechat)\s*[:：]?\s*[a-z0-9_-]{3,}/gi, "[联系方式已脱敏]")
    .replace(/(?:\/Users\/|\/home\/|~\/)[^\s`)>]+/g, "[本地路径已脱敏]")
    .replace(/[A-Z]:\\[^\s`)>]+/g, "[本地路径已脱敏]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,})\b/g, "[密钥已脱敏]")
    .replace(/\bAKIA[A-Z0-9]{16}\b/g, "[密钥已脱敏]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[密钥已脱敏]")
    .replace(/(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|authorization|cookie)\s*[:=]\s*["']?[A-Za-z0-9._~+\/-]{16,}["']?/gi, "[密钥已脱敏]");
}

function hasHighConfidenceSecret(text: string): boolean {
  return /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,})\b/.test(text)
    || /\bAKIA[A-Z0-9]{16}\b/.test(text)
    || /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/.test(text)
    || /(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|authorization|cookie)\s*[:=]\s*["']?[A-Za-z0-9._~+\/-]{16,}["']?/i.test(text);
}

export function redactRelativePath(relativePath: string): string {
  return redactSensitiveText(relativePath).replace(/(?:客户|业主)(?:姓名|住址|地址|身份证号|银行卡号)[^/\\]*/g, "[客户信息已脱敏]");
}
