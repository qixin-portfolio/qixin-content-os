import type { EditorialVoiceProfile, EditorialVoiceSample } from "./style-reviewer";

export function parseJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function toEditorialVoiceProfile(profile: {
  id: string;
  name: string;
  platform: EditorialVoiceProfile["platform"];
  tone: string;
  preferredWordsJson: string;
  avoidWordsJson: string;
  writingRulesJson: string;
  exampleTextsJson: string;
}): EditorialVoiceProfile {
  return {
    id: profile.id,
    name: profile.name,
    platform: profile.platform,
    tone: profile.tone,
    preferredWords: parseJsonArray(profile.preferredWordsJson),
    avoidWords: parseJsonArray(profile.avoidWordsJson),
    writingRules: parseJsonArray(profile.writingRulesJson),
    exampleTexts: parseJsonArray(profile.exampleTextsJson),
  };
}

export function toEditorialVoiceSamples(samples: Array<{
  platform: EditorialVoiceSample["platform"];
  title: string;
  body: string;
  qualityRating: number;
  approved: boolean;
}>): EditorialVoiceSample[] {
  return samples.map((sample) => ({
    platform: sample.platform,
    title: sample.title,
    body: sample.body,
    qualityRating: sample.qualityRating,
    approved: sample.approved,
  }));
}
