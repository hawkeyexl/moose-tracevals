/**
 * cost-check grader: Verify the trial stayed within budget.
 */

import type { Criterion, TrialContext, GraderResult } from "../../types.js";

export async function graderCostCheck(
  criterion: Criterion,
  context: TrialContext
): Promise<GraderResult> {
  const config = criterion.config ?? {};
  const maxCost = config.max_cost_usd as number | undefined;

  const actualCost = context.cost_usd;

  if (maxCost === undefined) {
    return {
      name: criterion.name,
      grader: "cost-check",
      pass: true,
      score: 1.0,
      reasoning: `Trial cost $${actualCost.toFixed(4)} (no max set)`,
      evidence: { actual_cost_usd: actualCost },
    };
  }

  const pass = actualCost <= maxCost;

  return {
    name: criterion.name,
    grader: "cost-check",
    pass,
    score: pass ? 1.0 : Math.max(0, 1.0 - (actualCost - maxCost) / maxCost),
    reasoning: pass
      ? `Trial cost $${actualCost.toFixed(4)} (within $${maxCost.toFixed(2)} budget)`
      : `Trial cost $${actualCost.toFixed(4)} (exceeded $${maxCost.toFixed(2)} budget)`,
    evidence: { actual_cost_usd: actualCost, max_cost_usd: maxCost },
  };
}
