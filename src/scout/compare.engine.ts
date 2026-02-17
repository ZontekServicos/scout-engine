import { Attributes } from "./ranking.engine";

export type AttributeResult = "A" | "B" | "DRAW";

export type AttributeComparison = Record<
  keyof Attributes,
  AttributeResult
>;

export type CompareResult = {
  attributes: AttributeComparison;
  score: {
    A: number;
    B: number;
  };
  winner: "A" | "B" | "DRAW";
};

export function compareAttributes(
  attributesA: Attributes,
  attributesB: Attributes
): CompareResult {
  const attributes: AttributeComparison = {
    pace: compareValue(attributesA.pace, attributesB.pace),
    shooting: compareValue(attributesA.shooting, attributesB.shooting),
    passing: compareValue(attributesA.passing, attributesB.passing),
    dribbling: compareValue(attributesA.dribbling, attributesB.dribbling),
    defending: compareValue(attributesA.defending, attributesB.defending),
    physical: compareValue(attributesA.physical, attributesB.physical),
  };

  const scoreA = Object.values(attributes).filter(v => v === "A").length;
  const scoreB = Object.values(attributes).filter(v => v === "B").length;

  let winner: "A" | "B" | "DRAW" = "DRAW";
  if (scoreA > scoreB) winner = "A";
  if (scoreB > scoreA) winner = "B";

  return {
    attributes,
    score: {
      A: scoreA,
      B: scoreB,
    },
    winner,
  };
}

function compareValue(a: number, b: number): AttributeResult {
  if (a > b) return "A";
  if (b > a) return "B";
  return "DRAW";
}
