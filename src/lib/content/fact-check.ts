export type FactCheckInput = {
  evidenceRequired?: string | null;
  result?: string | null;
  personalReflection?: string | null;
};

export type FactCheckResult = {
  valid: boolean;
  errors: string[];
};

export function factCheck(eventCard: FactCheckInput): FactCheckResult {
  const errors: string[] = [];

  if (!eventCard.evidenceRequired?.trim()) {
    errors.push("evidenceRequired is required");
  }

  if (!eventCard.result?.trim()) {
    errors.push("result is required");
  }

  if (!eventCard.personalReflection?.trim()) {
    errors.push("personalReflection is required");
  }

  return { valid: errors.length === 0, errors };
}
