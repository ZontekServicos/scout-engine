import { RiskResult } from "./risk.engine";
import { AntiFlopResult } from "./antiFlop.engine";

type DecisionInput = {
  playerName: string;
  performanceScore: number;
  averagePositionScore: number;
  risk: RiskResult;
  antiFlop: AntiFlopResult;
};

export function buildExecutiveDecisionSummary(input: DecisionInput): string {
  const { playerName, performanceScore, averagePositionScore, risk, antiFlop } = input;

  const performanceDelta = performanceScore - averagePositionScore;

  let performanceLabel = "aligned with positional benchmark";

  if (performanceDelta > 5) {
    performanceLabel = "strong competitive advantage";
  } else if (performanceDelta > 0) {
    performanceLabel = "moderate competitive advantage";
  } else if (performanceDelta < -5) {
    performanceLabel = "significant performance gap";
  } else if (performanceDelta < 0) {
    performanceLabel = "slight performance gap";
  }

  let recommendation = "Acquisition recommended.";

  if (antiFlop.classification === "HIGH_RISK") {
    recommendation = "Acquisition should be conditional and financially protected.";
  } else if (antiFlop.classification === "MODERATE") {
    recommendation = "Acquisition recommended with controlled exposure and monitoring.";
  }

  return `${playerName} demonstrates ${performanceLabel}. ${recommendation}`;
}
