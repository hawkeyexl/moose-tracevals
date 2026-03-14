/**
 * turn-count grader: Verify the trial completed within N turns.
 */

import type { Criterion, TrialContext, GraderResult } from "../../types.js";

export async function graderTurnCount(
  criterion: Criterion,
  context: TrialContext
): Promise<GraderResult> {
  const config = criterion.config ?? {};
  const maxTurns = config.max_turns as number | undefined;
  const minTurns = config.min_turns as number | undefined;

  const actualTurns = context.num_turns;
  let pass = true;
  const reasons: string[] = [];

  if (maxTurns !== undefined && actualTurns > maxTurns) {
    pass = false;
    reasons.push(`Took ${actualTurns} turns (max: ${maxTurns})`);
  }

  if (minTurns !== undefined && actualTurns < minTurns) {
    pass = false;
    reasons.push(`Took only ${actualTurns} turns (min: ${minTurns})`);
  }

  if (pass) {
    reasons.push(`Completed in ${actualTurns} turns`);
  }

  return {
    name: criterion.name,
    grader: "turn-count",
    pass,
    score: pass ? 1.0 : 0.0,
    reasoning: reasons.join("; "),
    evidence: { actual_turns: actualTurns, max_turns: maxTurns, min_turns: minTurns },
  };
}
