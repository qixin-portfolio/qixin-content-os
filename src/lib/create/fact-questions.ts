import type { CreateSourceMode } from "./types";

export function createFactQuestions(input: { sourceText: string; sourceMode: CreateSourceMode }) {
  const text = input.sourceText;
  if (/看到一个观点|别人的观点|有人说/u.test(text)) {
    return ["这个观点来自哪里或来自谁？", "它让你想到自己的哪段真实经历？", "你同意、怀疑，还是还没有结论？"];
  }
  if (/宝宝|带娃|出门|生活|孩子/u.test(text)) {
    return ["真实发生在哪里？", "有没有一个你确实记得的动作或画面？", "当时最真实的感受是什么？"];
  }
  if (input.sourceMode === "project" || /Content OS|功能|项目|Codex/u.test(text)) {
    return ["具体是哪项功能或哪一步？", "什么时刻让你意识到方向偏了？", "现在真实做到什么程度？"];
  }
  return ["发生时你确实记得的一个细节是什么？", "你当时最真实的判断是什么？"];
}

export function nonEmptyFactAnswers(answers: string[]) {
  return answers.map((answer) => answer.trim()).filter(Boolean);
}
