/**
 * Eval planning: turn resolved artifacts + extracted criteria into a flat
 * list of evals to run. Artifacts without declared criteria get one implicit
 * whole-artifact adherence eval (ADR 01002).
 */
import type { ResolvedArtifact } from "../artifacts/types.js";
import {
  extractCriteria,
  type Criterion,
  type Severity,
} from "../criteria/extract.js";

export interface EvalPlan {
  artifact: ResolvedArtifact;
  evalName: string;
  assertion: string;
  /** "llm" or a deterministic grader kind. */
  grader: string;
  options?: Record<string, unknown>;
  severity: Severity;
  evidence?: string;
  examples?: Criterion["examples"];
  /** True for the zero-config whole-artifact adherence eval. */
  implicit: boolean;
  /** Set when the artifact's evals block failed schema validation. */
  error?: string;
  /** Set when the artifact opted out via `skip: true`. */
  skipped?: boolean;
}

export const IMPLICIT_EVAL_NAME = "adheres-to-artifact";

export async function planEvals(
  artifacts: ResolvedArtifact[],
): Promise<EvalPlan[]> {
  const plans: EvalPlan[] = [];
  for (const artifact of artifacts) {
    const extracted = await extractCriteria(artifact);

    if (extracted.errors.length > 0) {
      const detail = extracted.errors
        .map(
          (e) =>
            `${e.instancePath || "/"}${e.line !== undefined ? ` (line ${e.line})` : ""}: ${e.message}`,
        )
        .join("; ");
      plans.push({
        artifact,
        evalName: "evals-block-valid",
        assertion: "The artifact's metadata.evals block matches the schema.",
        grader: "llm",
        severity: "error",
        implicit: false,
        error: `invalid metadata.evals block: ${detail}`,
      });
      continue;
    }

    if (extracted.skip) {
      plans.push({
        artifact,
        evalName: IMPLICIT_EVAL_NAME,
        assertion: "Artifact skipped via metadata.evals.skip.",
        grader: "llm",
        severity: "error",
        implicit: true,
        skipped: true,
      });
      continue;
    }

    if (extracted.criteria.length === 0) {
      plans.push({
        artifact,
        evalName: IMPLICIT_EVAL_NAME,
        assertion:
          `The session adhered to the instructions in this ${artifact.type} ` +
          `("${artifact.name}"). Cite the specific instructions followed or violated.`,
        grader: "llm",
        severity: "error",
        implicit: true,
      });
      continue;
    }

    for (const criterion of extracted.criteria) {
      const plan: EvalPlan = {
        artifact,
        evalName: criterion.name,
        assertion: criterion.assertion,
        grader: criterion.grader,
        severity: criterion.severity,
        implicit: false,
      };
      if (criterion.options) plan.options = criterion.options;
      if (criterion.evidence) plan.evidence = criterion.evidence;
      if (criterion.examples) plan.examples = criterion.examples;
      plans.push(plan);
    }
  }
  return plans;
}
