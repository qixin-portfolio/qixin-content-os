import type { CreateSourceMode, FactCategory, FactLedger, FactSourceType } from "./types";

function splitRawInput(rawInput: string) {
  return rawInput
    .split(/[。！？!?\n]+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function sourceTypeFor(text: string): FactSourceType {
  if (/^(?:我看到|有人提出|一篇外部长文).{0,12}(?:观点|提到)|^别人的观点|观点来自.{0,24}(?:外部长文|X 收藏)/u.test(text)) return "external_opinion";
  if (/(?:我想到|我认为|我觉得|我发现|我同意|我怀疑|真正想要|反而偏离)/u.test(text)) return "user_judgment";
  return "raw_input";
}

function factAnswerSourceTypeFor(text: string): FactSourceType {
  const classified = sourceTypeFor(text);
  return classified === "raw_input" ? "fact_answer" : classified;
}

function categoryFor(text: string, sourceType: FactSourceType): FactCategory {
  if (sourceType === "external_opinion") return "external_claim";
  if (sourceType === "user_judgment") return "user_judgment";
  if (/(?:今天|昨天|这两天|最近一次|\d{4}[-/年])/u.test(text)) return "time";
  if (/(?:在.{1,12}|(?:湖|路|街|店|边|里)$)/u.test(text)) return "place";
  if (/(?:手酸|疲惫|疼|饿|困|发抖)/u.test(text)) return "physical_feeling";
  if (/(?:焦虑|开心|难过|委屈|兴奋)/u.test(text)) return "emotion";
  if (/(?:上线|客户|用户|收入|成交|营收|结果)/u.test(text)) return "result";
  if (/(?:Content OS|Publication|功能|项目|页面|代码|检查单|hash)/iu.test(text)) return "project_state";
  if (/(?:照片|相机|菜单|物件)/u.test(text)) return "object";
  if (/(?:打开|抱着|出门|看到|做了|拍)/u.test(text)) return "action";
  return "other";
}

export function createFactLedger(input: {
  rawInput: string;
  factAnswers: string[];
  sourceMode: CreateSourceMode;
}): FactLedger {
  const entries: Array<{ text: string; sourceType: FactSourceType }> = [
    ...splitRawInput(input.rawInput).map((text) => ({ text, sourceType: sourceTypeFor(text) })),
    ...input.factAnswers.map((text) => text.trim()).filter(Boolean).map((text) => ({ text, sourceType: factAnswerSourceTypeFor(text) })),
  ];

  return {
    sourceMode: input.sourceMode,
    facts: entries.map((entry, index) => ({
      id: `F${index + 1}`,
      text: entry.text,
      sourceType: entry.sourceType,
      category: categoryFor(entry.text, entry.sourceType),
    })),
  };
}
