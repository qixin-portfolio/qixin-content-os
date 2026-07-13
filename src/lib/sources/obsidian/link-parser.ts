import type { ObsidianLinks, ObsidianWikiLink } from "./types.ts";

const attachmentPattern = /\.(?:png|jpe?g|gif|webp|svg|mp4|mov|webm|pdf|mp3|wav|docx?|xlsx?)$/i;

export function parseObsidianLinks(markdown: string): ObsidianLinks {
  const wikiLinks: ObsidianWikiLink[] = [];
  const attachmentRefs: string[] = [];
  const seenWiki = new Set<string>();
  const seenAttachments = new Set<string>();

  for (const match of markdown.matchAll(/(!?)\[\[([^\]]+)\]\]/g)) {
    const embed = match[1] === "!";
    const [rawTarget, rawAlias] = match[2].split("|");
    const target = rawTarget.split("#")[0].trim();
    if (!target) continue;
    const link = { target, alias: rawAlias?.trim() || undefined, embed };
    if (!embed) {
      const key = JSON.stringify(link);
      if (!seenWiki.has(key)) {
        seenWiki.add(key);
        wikiLinks.push(link);
      }
    }
    if (embed || attachmentPattern.test(target)) addUnique(attachmentRefs, seenAttachments, normalizeTarget(target));
  }

  for (const match of markdown.matchAll(/!?(?:\[[^\]]*\])\(([^)]+)\)/g)) {
    const target = match[1].trim().replace(/^<|>$/g, "");
    if (attachmentPattern.test(target) && !/^https?:\/\//i.test(target)) {
      addUnique(attachmentRefs, seenAttachments, normalizeTarget(target));
    }
  }

  const externalLinks = [...new Set(
    [...markdown.matchAll(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g), ...markdown.matchAll(/(?<!["'(=])https?:\/\/[^\s)\]>]+/g)]
      .map((match) => match[1] ?? match[0]),
  )];

  return { wikiLinks, externalLinks, attachmentRefs };
}

function normalizeTarget(target: string): string {
  return target.replace(/^\.\//, "").replace(/\\/g, "/");
}

function addUnique(values: string[], seen: Set<string>, value: string) {
  if (!value || seen.has(value)) return;
  seen.add(value);
  values.push(value);
}
