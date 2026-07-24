/** Shared helpers for deterministic graders. */
import type { EvalPlan } from "../core/plan.js";
import type { Finding, GradeResult } from "./types.js";

export function finding(plan: EvalPlan, message: string): Finding {
  return {
    evalName: plan.evalName,
    artifact: plan.artifact.path,
    message,
    severity: plan.severity,
  };
}

export function fail(plan: EvalPlan, message: string): GradeResult {
  return { findings: [finding(plan, message)] };
}

export const pass: GradeResult = { findings: [] };

export function optionsError(kind: string, message: string): GradeResult {
  return { findings: [], error: `${kind}: ${message}` };
}
