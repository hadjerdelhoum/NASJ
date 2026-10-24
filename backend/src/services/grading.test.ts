import { describe, expect, it } from "vitest";
import { grade, nextMastery } from "./grading.js";

const qs = [
  { id: "a", correct_index: 1 },
  { id: "b", correct_index: 0 },
  { id: "c", correct_index: 2 },
];

describe("grade", () => {
  it("counts correct answers and pass threshold", () => {
    const r = grade(qs, [
      { questionId: "a", choice: 1 },
      { questionId: "b", choice: 0 },
      { questionId: "c", choice: 0 },
    ], 0.6);
    expect(r.correct).toBe(2);
    expect(r.passed).toBe(true);
  });
  it("ignores unknown and duplicate questions", () => {
    const r = grade(qs, [
      { questionId: "a", choice: 1 },
      { questionId: "a", choice: 1 },
      { questionId: "zzz", choice: 0 },
    ], 0.6);
    expect(r.correct).toBe(1);
    expect(r.passed).toBe(false);
  });
});

describe("nextMastery", () => {
  it("adapts within bounds", () => {
    expect(nextMastery(1, 1)).toBe(2);
    expect(nextMastery(3, 1)).toBe(3);
    expect(nextMastery(2, 0.2)).toBe(1);
    expect(nextMastery(1, 0.2)).toBe(1);
    expect(nextMastery(2, 0.6)).toBe(2);
  });
});
