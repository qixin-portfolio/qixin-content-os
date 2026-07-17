import type { MaterialIndex, MaterialIndexItem, MaterialSearchResult } from "./types.ts";

function compact(value: string) {
  return value.toLocaleLowerCase().replace(/\s+/g, "");
}

function querySegments(query: string) {
  const chunks = query.match(/[A-Za-z0-9]+|[\u3400-\u9fff]+/g) || [];
  return chunks.flatMap((chunk) => /[\u3400-\u9fff]/.test(chunk)
    ? Array.from({ length: Math.ceil(chunk.length / 2) }, (_, index) => chunk.slice(index * 2, index * 2 + 2)).filter((value) => value.length > 1)
    : [chunk]);
}

function scoreField(value: string, query: string, fullWeight: number, tokenWeight: number) {
  const normalized = compact(value);
  const normalizedQuery = compact(query);
  if (!normalized || !normalizedQuery) return { score: 0, full: false, tokens: [] as string[] };
  if (normalized.includes(normalizedQuery)) return { score: fullWeight, full: true, tokens: [query.trim()] };
  const tokens = querySegments(query).filter((token) => token.length > 1 && normalized.includes(compact(token)));
  return { score: tokens.length * tokenWeight, full: false, tokens };
}

function recencyScore(item: MaterialIndexItem) {
  const timestamp = Date.parse(item.savedAt || item.modifiedAt);
  if (Number.isNaN(timestamp)) return 0;
  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000);
  return Math.max(0, 5 - Math.floor(ageDays / 30));
}

function minimumMatchedTerms(query: string) {
  const segments = querySegments(query).filter((segment) => segment.length > 1);
  if (segments.length <= 1) return 1;
  return Math.max(2, Math.ceil(segments.length * 0.6));
}

function scoreIdentifiers(identifiers: string[], query: string) {
  const normalizedQuery = compact(query);
  if (identifiers.some((identifier) => compact(identifier) === normalizedQuery)) {
    return { score: 90, full: true, tokens: [query.trim()] };
  }
  if (querySegments(query).length === 1 && identifiers.some((identifier) => compact(identifier).includes(normalizedQuery))) {
    return { score: 30, full: false, tokens: [query.trim()] };
  }
  return { score: 0, full: false, tokens: [] as string[] };
}

export function searchMaterials(index: MaterialIndex, query: string, limit = 10): MaterialSearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const urlIdentifier = compact(trimmed).replace(/^https?:\/\//, "");
  if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}\//i.test(urlIdentifier)) {
    return index.items
      .filter((item) => compact(item.sourceUrl || "").replace(/^https?:\/\//, "").includes(urlIdentifier))
      .slice(0, Math.max(0, Math.min(limit, 10)))
      .map((item) => ({
        sourceId: item.sourceId,
        title: item.title,
        author: item.author,
        relativePath: item.relativePath,
        sourceUrl: item.sourceUrl,
        sourcePlatform: item.sourcePlatform,
        savedAt: item.savedAt,
        excerpt: item.excerpt,
        matchedTerms: [trimmed],
        matchReason: "原始链接标识匹配",
      }));
  }
  const requiredTerms = minimumMatchedTerms(trimmed);
  return index.items.map((item) => {
    const title = scoreField(item.title, trimmed, 160, 60);
    const tag = scoreField(item.tags.join(" "), trimmed, 120, 40);
    const identity = scoreField(`${item.author} ${item.sourceUrl || ""} ${item.sourcePlatform}`, trimmed, 90, 30);
    const identifier = scoreIdentifiers(item.identifiers, trimmed);
    const body = scoreField(item.excerpt, trimmed, 50, 12);
    const baseScore = title.score + tag.score + identity.score + identifier.score + body.score;
    const score = baseScore + recencyScore(item);
    const matchedTerms = Array.from(new Set([...title.tokens, ...tag.tokens, ...identity.tokens, ...identifier.tokens, ...body.tokens]));
    const fullMatch = title.full || tag.full || identity.full || identifier.full || body.full;
    const matchReason = [
      title.score > 0 ? "标题匹配" : "",
      tag.score > 0 ? "标签匹配" : "",
      identity.score > 0 ? "作者或来源匹配" : "",
      body.score > 0 ? "正文关键词匹配" : "",
    ].filter(Boolean).join("；");
    return { item, score, matchedTerms, matchReason, fullMatch };
  }).filter((candidate) => candidate.score > recencyScore(candidate.item) && (candidate.fullMatch || candidate.matchedTerms.length >= requiredTerms))
    .sort((left, right) => right.score - left.score || left.item.relativePath.localeCompare(right.item.relativePath))
    .slice(0, Math.max(0, Math.min(limit, 10)))
    .map(({ item, matchedTerms, matchReason }) => ({
      sourceId: item.sourceId,
      title: item.title,
      author: item.author,
      relativePath: item.relativePath,
      sourceUrl: item.sourceUrl,
      sourcePlatform: item.sourcePlatform,
      savedAt: item.savedAt,
      excerpt: item.excerpt,
      matchedTerms,
      matchReason,
    }));
}
