import type { RawCreateDraft } from "./draft-generator";
import type { CreateVoiceSample } from "./voice-style";

const bannedTemplatePhrases = [
  "最近最大的感受",
  "做到这里才发现",
  "有一个很直接的感受",
  "先把这个偏差记下来",
  "这个判断还要继续验证",
  "其他功能再慢慢看",
  "先回到",
  "其他的以后再加",
  "记录一下",
];

function normalize(value: string) {
  return value.replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()]/gu, "").toLowerCase();
}

function sentences(body: string) {
  return body.split(/[。！？!?\n]+/u).map((item) => item.trim()).filter(Boolean);
}

function paragraphs(body: string) {
  return body.split(/\n\s*\n/u).map((item) => item.trim()).filter(Boolean);
}

function firstSentence(body: string) {
  return sentences(body)[0] ?? "";
}

function lastSentence(body: string) {
  return sentences(body).at(-1) ?? "";
}

function isSubsetDraft(shorter: string, longer: string) {
  const shortSentences = sentences(shorter).map(normalize);
  const longSentences = new Set(sentences(longer).map(normalize));
  return shortSentences.length > 0 && shortSentences.every((item) => longSentences.has(item));
}

function hasRepeatedSequence(left: string, right: string) {
  const leftSentences = sentences(left).map(normalize);
  const rightSentences = sentences(right).map(normalize);
  for (let leftIndex = 0; leftIndex < leftSentences.length - 1; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < rightSentences.length - 1; rightIndex += 1) {
      if (leftSentences[leftIndex] === rightSentences[rightIndex]
        && leftSentences[leftIndex + 1] === rightSentences[rightIndex + 1]) return true;
    }
  }
  return false;
}

function copiedSampleKeys(drafts: RawCreateDraft[], samples: CreateVoiceSample[]) {
  const sampleSentences = samples.flatMap((sample) => sentences(sample.body)).filter((item) => normalize(item).length >= 12);
  return drafts.filter((draft) => sampleSentences.some((sampleSentence) => sentences(draft.body).some((item) => normalize(item) === normalize(sampleSentence)))).map((draft) => draft.key);
}

export function checkDraftSimilarity(drafts: RawCreateDraft[], voiceSamples: CreateVoiceSample[] = []) {
  const issues = new Set<string>();
  const retryKeys = new Set<RawCreateDraft["key"]>();

  for (let leftIndex = 0; leftIndex < drafts.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < drafts.length; rightIndex += 1) {
      const left = drafts[leftIndex];
      const right = drafts[rightIndex];
      if (normalize(firstSentence(left.body)) === normalize(firstSentence(right.body))) {
        issues.add("首句重复");
        retryKeys.add(right.key);
      }
      const repeatedSequence = hasRepeatedSequence(left.body, right.body);
      if (repeatedSequence) {
        issues.add("连续相同句子");
        retryKeys.add(right.key);
      }
      if (normalize(lastSentence(left.body)) === normalize(lastSentence(right.body))) {
        issues.add("结尾结构重复");
        retryKeys.add(right.key);
      }
      if (paragraphs(left.body).length === paragraphs(right.body).length && repeatedSequence) {
        issues.add("段落结构重复");
        retryKeys.add(right.key);
      }
      const sameOpening = normalize(firstSentence(left.body)) === normalize(firstSentence(right.body));
      const sameEnding = normalize(lastSentence(left.body)) === normalize(lastSentence(right.body));
      if ((sameOpening || sameEnding) && (isSubsetDraft(left.body, right.body) || isSubsetDraft(right.body, left.body))) {
        issues.add("候选稿只是长短变化");
        retryKeys.add(right.key);
      }
    }
  }

  const copiedKeys = copiedSampleKeys(drafts, voiceSamples);
  if (copiedKeys.length > 0) {
    issues.add("候选稿复制了 VoiceSample 完整句子");
    copiedKeys.forEach((key) => retryKeys.add(key));
  }

  const templatedKeys = drafts
    .filter((draft) => bannedTemplatePhrases.some((phrase) => draft.body.includes(phrase)))
    .map((draft) => draft.key);
  if (templatedKeys.length > 0) {
    issues.add("候选稿命中禁用模板短语");
    templatedKeys.forEach((key) => retryKeys.add(key));
  }

  return {
    valid: issues.size === 0,
    issues: Array.from(issues),
    retryKeys: Array.from(retryKeys),
  };
}
