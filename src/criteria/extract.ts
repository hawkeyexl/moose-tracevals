/**
 * Criteria extraction: read the `metadata.evals` frontmatter block from an
 * artifact via docmeta and validate it against the published schema. Invalid
 * blocks are reported as errors with source line numbers, never silently
 * ignored (ADR 01002).
 */
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { extractFrontmatter, Validator, type FieldError } from "docmeta";
import type { ResolvedArtifact } from "../artifacts/types.js";

export const ARTIFACT_EVALS_SCHEMA_ID =
  "https://raw.githubusercontent.com/hawkeyexl/moose-tracevals/main/schemas/artifact-evals-0.2.json";

/** Absolute path of the packaged schema (works from src and dist). */
export function artifactEvalsSchemaPath(): string {
  // src/criteria/ and dist/ are both one hop from the package root.
  const here = dirname(fileURLToPath(import.meta.url));
  const fromSrc = join(here, "..", "..", "schemas", "artifact-evals-0.2.json");
  const fromDist = join(here, "..", "schemas", "artifact-evals-0.2.json");
  // tsup bundles to dist/ flat; src runs nested. Prefer whichever exists at
  // require time — but stat here would make this async, so decide by marker.
  return here.endsWith("criteria") ? fromSrc : fromDist;
}

export type Severity = "error" | "warning" | "info";

/**
 * `capability` probes a boundary and is expected to fail sometimes;
 * `regression` protects behavior that already works. Reported, not enforced.
 */
export type CriterionType = "capability" | "regression";

export interface Criterion {
  name: string;
  assertion: string;
  type: CriterionType;
  /** "llm" or a deterministic grader kind. */
  grader: string;
  options?: Record<string, unknown>;
  severity: Severity;
  evidence?: string;
  examples?: { pass?: string[]; fail?: string[] };
}

export interface ExtractedCriteria {
  criteria: Criterion[];
  /** Schema violations in the evals block, with line numbers when known. */
  errors: FieldError[];
  /** Whether a `metadata.evals` block was present. */
  declared: boolean;
  skip: boolean;
}

const validator = new Validator();

export async function extractCriteria(
  artifact: ResolvedArtifact,
): Promise<ExtractedCriteria> {
  const extracted = extractFrontmatter(artifact.content, "markdown");
  const metadata = extracted.data.metadata as
    | Record<string, unknown>
    | undefined;
  const evals = metadata?.evals as Record<string, unknown> | undefined;
  if (!extracted.present || evals === undefined) {
    return { criteria: [], errors: [], declared: false, skip: false };
  }

  const errors = await validator.validate(
    evals,
    [artifactEvalsSchemaPath()],
    (pointer: string) => extracted.lineFor(`/metadata/evals${pointer}`),
  );
  if (errors.length > 0) {
    return { criteria: [], errors, declared: true, skip: false };
  }

  const skip = evals.skip === true;
  const rawCriteria = Array.isArray(evals.criteria) ? evals.criteria : [];
  const criteria = rawCriteria.map((raw, index) =>
    normalizeCriterion(raw, index),
  );
  return { criteria, errors: [], declared: true, skip };
}

function normalizeCriterion(raw: unknown, index: number): Criterion {
  if (typeof raw === "string") {
    return {
      name: `criterion-${index + 1}`,
      assertion: raw,
      type: "regression",
      grader: "llm",
      severity: "error",
    };
  }
  const obj = raw as Record<string, unknown>;
  const criterion: Criterion = {
    name:
      typeof obj.name === "string" ? obj.name : `criterion-${index + 1}`,
    assertion: obj.assertion as string,
    type: (obj.type as CriterionType | undefined) ?? "regression",
    grader: typeof obj.grader === "string" ? obj.grader : "llm",
    severity: (obj.severity as Severity | undefined) ?? "error",
  };
  if (obj.options && typeof obj.options === "object") {
    criterion.options = obj.options as Record<string, unknown>;
  }
  if (typeof obj.evidence === "string") criterion.evidence = obj.evidence;
  if (obj.examples && typeof obj.examples === "object") {
    criterion.examples = obj.examples as Criterion["examples"];
  }
  return criterion;
}
