/**
 * Composite graders: all-of, any-of, weighted.
 * Combine multiple sub-graders with logic.
 */

import type { Criterion, TrialContext, GraderResult } from "../types.js";
import { runGrader } from "./index.js";

export async function graderComposite(
  criterion: Criterion,
  context: TrialContext,
  judgeModel: string
): Promise<GraderResult> {
  const mode = criterion.grader as "all-of" | "any-of" | "weighted";
  const subCriteria = criterion.sub_criteria ?? [];

  if (subCriteria.length === 0) {
    return {
      name: criterion.name,
      grader: mode,
      pass: false,
      score: 0.0,
      reasoning: "No sub-criteria defined for composite grader",
    };
  }

  // Run all sub-graders
  const subResults = await Promise.all(
    subCriteria.map((sub) => runGrader(sub, context, judgeModel))
  );

  const evidence: Record<string, unknown> = {
    sub_results: subResults.map((r) => ({
      name: r.name,
      pass: r.pass,
      score: r.score,
      reasoning: r.reasoning,
    })),
  };

  switch (mode) {
    case "all-of": {
      const pass = subResults.every((r) => r.pass);
      const score = subResults.reduce((sum, r) => sum + r.score, 0) / subResults.length;
      const failed = subResults.filter((r) => !r.pass).map((r) => r.name);
      return {
        name: criterion.name,
        grader: "all-of",
        pass,
        score,
        reasoning: pass
          ? `All ${subResults.length} sub-criteria passed`
          : `Failed sub-criteria: ${failed.join(", ")}`,
        evidence,
      };
    }

    case "any-of": {
      const pass = subResults.some((r) => r.pass);
      const score = Math.max(...subResults.map((r) => r.score));
      const passed = subResults.filter((r) => r.pass).map((r) => r.name);
      return {
        name: criterion.name,
        grader: "any-of",
        pass,
        score,
        reasoning: pass
          ? `Passed sub-criteria: ${passed.join(", ")}`
          : `None of ${subResults.length} sub-criteria passed`,
        evidence,
      };
    }

    case "weighted": {
      const totalWeight = subCriteria.reduce((sum, c) => sum + (c.weight ?? 1), 0);
      let weightedScore = 0;
      for (let i = 0; i < subResults.length; i++) {
        const weight = subCriteria[i].weight ?? 1;
        weightedScore += subResults[i].score * (weight / totalWeight);
      }
      const pass = weightedScore >= 0.7;
      return {
        name: criterion.name,
        grader: "weighted",
        pass,
        score: weightedScore,
        reasoning: `Weighted score: ${(weightedScore * 100).toFixed(1)}% (threshold: 70%)`,
        evidence,
      };
    }

    default:
      return {
        name: criterion.name,
        grader: mode,
        pass: false,
        score: 0.0,
        reasoning: `Unknown composite mode: ${mode}`,
      };
  }
}
