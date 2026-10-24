export interface StoredQuestion {
  id: string;
  correct_index: number;
}

export interface Answer {
  questionId: string;
  choice: number;
}

export interface GradeResult {
  total: number;
  correct: number;
  ratio: number;
  passed: boolean;
  perQuestion: { questionId: string; correct: boolean }[];
}

/** Pure grading: only questions actually served by the server count; duplicates are ignored. */
export function grade(
  questions: StoredQuestion[],
  answers: Answer[],
  passRatio: number,
  total: number = questions.length
): GradeResult {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const seen = new Set<string>();
  const perQuestion: GradeResult["perQuestion"] = [];
  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (!q || seen.has(a.questionId)) continue;
    seen.add(a.questionId);
    perQuestion.push({ questionId: a.questionId, correct: q.correct_index === a.choice });
  }
  const correct = perQuestion.filter((p) => p.correct).length;
  const ratio = total === 0 ? 0 : correct / total;
  return { total, correct, ratio, passed: ratio >= passRatio, perQuestion };
}

/** Adaptive difficulty: step up after a strong result, down after a weak one. */
export function nextMastery(current: number, ratio: number): number {
  if (ratio >= 0.85) return Math.min(3, current + 1);
  if (ratio < 0.4) return Math.max(1, current - 1);
  return current;
}
