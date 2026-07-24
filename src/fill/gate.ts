/**
 * Proposal gate: everything between "the model said so" and "this is written
 * to a file the user maintains".
 *
 * Self-reported confidence is a weak signal on its own, so it is the *last*
 * filter, not the only one. Mechanical checks run first — grader scope, the
 * grader's own option validation (ADR 01004), and whether the target the
 * criterion names actually exists in the project.
 */
import { graderFor } from "../graders/registry.js";
import type { ArtifactType } from "../artifacts/types.js";
import type { Severity } from "../criteria/extract.js";

export interface ProposedCriterion {
  name: string;
  assertion: string;
  grader: string;
  options?: Record<string, unknown>;
  evidence?: string;
  examples: { pass: string; fail: string };
  severity?: Severity;
  confidence: number;
  rationale?: string;
}

export type RejectionReason =
  | "low-confidence"
  | "invalid-options"
  | "grader-not-allowed"
  | "ungrounded-target"
  | "duplicate-name";

export interface Rejection {
  criterion: ProposedCriterion;
  reason: RejectionReason;
  detail?: string;
}

export interface Vocabulary {
  /** Tool names the project can actually produce in a trace. */
  tools: Set<string>;
  /** Skill names discovered in the same scan. */
  skills: Set<string>;
}

export interface GateOptions {
  artifactType: ArtifactType;
  threshold: number;
  existingNames: string[];
  maxCriteria: number;
  vocabulary: Vocabulary;
}

export interface GateResult {
  accepted: ProposedCriterion[];
  rejected: Rejection[];
  /** Survivors dropped for exceeding the per-artifact cap, most confident first. */
  capped: ProposedCriterion[];
}

/**
 * Which graders may be proposed for each artifact type.
 *
 * `cost`, `turn-count`, and `json-output` are whole-session graders: a budget
 * declared inside one skill silently constrains the entire session and
 * double-counts when several artifacts declare it. `skill-invoked` is excluded
 * from skills and agents because a criterion asserting its own artifact was
 * used can only be graded in sessions that used it — permanently green.
 */
export const ALLOWED_GRADERS: Record<ArtifactType, readonly string[]> = {
  skill: ["llm", "tool-usage", "file-access", "regex"],
  agent: ["llm", "tool-usage", "file-access"],
  "project-rules": ["llm", "skill-invoked", "tool-usage"],
};

/** Absolute paths are machine-specific; file-access matches on a suffix. */
function isAbsoluteish(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
}

/**
 * Does the criterion name something that can exist in a trace? Rejects
 * hallucinated tool names and skills, however confident the model claims to be.
 */
function groundingError(
  criterion: ProposedCriterion,
  vocabulary: Vocabulary,
): string | undefined {
  const options = criterion.options ?? {};
  if (criterion.grader === "tool-usage") {
    const tool = options.tool;
    // MCP tools are named at connect time, so they cannot be enumerated ahead
    // of a session; the prefix is the only available signal.
    if (
      typeof tool === "string" &&
      !tool.startsWith("mcp__") &&
      !vocabulary.tools.has(tool)
    ) {
      return `no tool named "${tool}" is available in this project`;
    }
  }
  if (criterion.grader === "skill-invoked") {
    const skill = options.skill;
    if (typeof skill === "string" && !vocabulary.skills.has(skill)) {
      return `no skill named "${skill}" was found in this project`;
    }
  }
  if (criterion.grader === "file-access") {
    const path = options.path;
    if (typeof path === "string" && isAbsoluteish(path)) {
      return `options.path must be a repository-relative suffix, not "${path}"`;
    }
  }
  return undefined;
}

/**
 * A criterion in an agent definition describes what the *subagent* did, and
 * subagent tool calls are recorded as sidechain calls — which tool-usage
 * excludes by default. Left alone, such a criterion silently measures the
 * main thread instead.
 */
function normalize(
  criterion: ProposedCriterion,
  artifactType: ArtifactType,
): ProposedCriterion {
  if (artifactType !== "agent" || criterion.grader !== "tool-usage") {
    return criterion;
  }
  return {
    ...criterion,
    options: { ...(criterion.options ?? {}), includeSidechains: true },
  };
}

export function gateProposals(
  proposals: ProposedCriterion[],
  options: GateOptions,
): GateResult {
  const { artifactType, threshold, maxCriteria, vocabulary } = options;
  const allowed = new Set(ALLOWED_GRADERS[artifactType]);
  const taken = new Set(options.existingNames);
  const rejected: Rejection[] = [];
  const survivors: ProposedCriterion[] = [];

  for (const raw of proposals) {
    // Names first: a duplicate is rejected on its own terms rather than
    // competing for a slot under the cap.
    if (taken.has(raw.name)) {
      rejected.push({ criterion: raw, reason: "duplicate-name" });
      continue;
    }
    if (!allowed.has(raw.grader)) {
      rejected.push({
        criterion: raw,
        reason: "grader-not-allowed",
        detail: `${raw.grader} may not be declared on a ${artifactType} artifact`,
      });
      continue;
    }

    const criterion = normalize(raw, artifactType);

    if (criterion.grader !== "llm") {
      const grader = graderFor(criterion.grader);
      const validate = grader?.validateOptions;
      if (validate === undefined) {
        // Without a ground-check there is no way to know the options are
        // usable, and an unusable criterion errors on every future run.
        rejected.push({
          criterion,
          reason: "invalid-options",
          detail: `grader ${criterion.grader} cannot validate its options`,
        });
        continue;
      }
      const invalid = validate(criterion.options ?? {});
      if (invalid !== undefined) {
        rejected.push({ criterion, reason: "invalid-options", detail: invalid });
        continue;
      }
      const ungrounded = groundingError(criterion, vocabulary);
      if (ungrounded !== undefined) {
        rejected.push({
          criterion,
          reason: "ungrounded-target",
          detail: ungrounded,
        });
        continue;
      }
    }

    taken.add(criterion.name);
    survivors.push(criterion);
  }

  // Confidence last, then the cap — so the cap drops the least confident of
  // the criteria that were otherwise acceptable, and the two reasons stay
  // distinguishable in the report.
  const confident: ProposedCriterion[] = [];
  for (const criterion of survivors) {
    if (criterion.confidence >= threshold) confident.push(criterion);
    else rejected.push({ criterion, reason: "low-confidence" });
  }
  confident.sort((a, b) => b.confidence - a.confidence);

  return {
    accepted: confident.slice(0, maxCriteria),
    capped: confident.slice(maxCriteria),
    rejected,
  };
}
