export type FrontmatterValue = string | boolean | number | string[];

export type ParsedFrontmatter = {
  hasFrontmatter: boolean;
  attributes: Record<string, FrontmatterValue>;
  body: string;
};

export function parseFrontmatter(markdown: string): ParsedFrontmatter {
  const normalized = markdown.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { hasFrontmatter: false, attributes: {}, body: normalized };
  }

  const closing = normalized.indexOf("\n---", 4);
  if (closing === -1 || !/^\n---(?:\n|$)/.test(normalized.slice(closing))) {
    return { hasFrontmatter: false, attributes: {}, body: normalized };
  }

  const raw = normalized.slice(4, closing);
  const attributes: Record<string, FrontmatterValue> = {};
  let listKey: string | undefined;
  for (const line of raw.split("\n")) {
    const listItem = line.match(/^\s*-\s*(.+?)\s*$/);
    if (listItem && listKey) {
      const current = attributes[listKey];
      attributes[listKey] = [...(Array.isArray(current) ? current : []), parseScalar(listItem[1]) as string];
      continue;
    }

    const pair = line.match(/^\s*([^:#]+?)\s*:\s*(.*?)\s*$/);
    if (!pair) {
      listKey = undefined;
      continue;
    }
    const key = pair[1].trim();
    const value = pair[2].trim();
    if (!value) {
      attributes[key] = [];
      listKey = key;
    } else {
      attributes[key] = parseScalar(value);
      listKey = undefined;
    }
  }

  return {
    hasFrontmatter: true,
    attributes,
    body: normalized.slice(closing + "\n---".length).replace(/^\n+/, ""),
  };
}

function parseScalar(value: string): FrontmatterValue {
  const unquoted = value.replace(/^(['"])(.*)\1$/, "$2");
  if (unquoted === "true") return true;
  if (unquoted === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(unquoted)) return Number(unquoted);
  if (unquoted.startsWith("[") && unquoted.endsWith("]")) {
    return unquoted
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim().replace(/^(['"])(.*)\1$/, "$2"))
      .filter(Boolean);
  }
  return unquoted;
}

export function frontmatterString(attributes: Record<string, FrontmatterValue>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = attributes[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return undefined;
}

export function frontmatterBoolean(attributes: Record<string, FrontmatterValue>, key: string): boolean {
  const value = attributes[key];
  return value === true || value === "true";
}

export function frontmatterStrings(attributes: Record<string, FrontmatterValue>, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = attributes[key];
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (typeof value === "string" && value.trim()) return [value.trim()];
  }
  return [];
}
