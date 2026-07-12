import type {
  EditorialVoiceProfile,
  EditorialVoiceSample,
  StyleReviewDraft,
} from "./style-reviewer";

type EditorialDraftText = {
  title: string;
  hook: string;
  body: string;
  cta: string;
};

export type EditorialSuggestionResult = {
  titleSuggestions: string[];
  hookSuggestions: string[];
  bodySuggestions: Array<{ original: string; suggested: string; reason: string }>;
  ctaSuggestions: string[];
  allowEmptyHook: boolean;
  allowEmptyCta: boolean;
};

export function suggestEditorialChanges({
  editorialDraft,
  styleReview,
  voiceProfile,
  voiceSamples,
}: {
  editorialDraft: EditorialDraftText;
  styleReview: StyleReviewDraft;
  voiceProfile: EditorialVoiceProfile;
  voiceSamples: EditorialVoiceSample[];
}): EditorialSuggestionResult {
  const result: EditorialSuggestionResult = {
    titleSuggestions: [],
    hookSuggestions: [],
    bodySuggestions: [],
    ctaSuggestions: ["可以留空，不必强行加入行动号召。"],
    allowEmptyHook: true,
    allowEmptyCta: true,
  };

  for (const suggestion of styleReview.suggestions) {
    const value = suggestion.suggestedText.trim();
    if (suggestion.field === "title") result.titleSuggestions.push(value || "保留事实标题，不额外拔高。");
    if (suggestion.field === "hook") result.hookSuggestions.push(value || "可以留空，直接从具体经历开始。");
    if (suggestion.field === "body") {
      result.bodySuggestions.push({
        original: suggestion.originalText,
        suggested: value,
        reason: suggestion.reason,
      });
    }
    if (suggestion.field === "cta") result.ctaSuggestions.push(value || "可以删除当前 CTA，不补写引导关注或私信。");
  }

  if (!editorialDraft.hook.trim()) result.hookSuggestions.push("当前 Hook 可以保持为空。");
  if (!editorialDraft.cta.trim()) result.ctaSuggestions.push("当前 CTA 可以保持为空。");
  if (voiceSamples.filter((sample) => sample.approved).length === 0) {
    result.bodySuggestions.push({
      original: editorialDraft.body,
      suggested: editorialDraft.body,
      reason: "当前只有规则，没有足够的本人批准样本；这是规则校准，不是完整个人声音学习。",
    });
  }
  if (voiceProfile.writingRules.includes("第一人称") && !editorialDraft.body.includes("我")) {
    result.bodySuggestions.push({
      original: editorialDraft.body,
      suggested: editorialDraft.body,
      reason: "如果事实允许，可以补充本人实际判断；不要为了第一人称虚构经历。",
    });
  }

  return result;
}
