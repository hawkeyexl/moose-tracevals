/**
 * Grader registry — maps grader names to implementations.
 * Code graders are deterministic. LLM graders use claude CLI via judge.ts.
 */

import type { Criterion, TrialContext, GraderResult, GraderFn } from "../types.js";
import { invokeJudge, formatTranscriptForJudge } from "../judge.js";

// Code-based graders
import { graderTriggerCheck } from "./code/trigger-check.js";
import { graderDiffCheck } from "./code/diff-check.js";
import { graderJsonSchema } from "./code/json-schema.js";
import { graderRegexMatch } from "./code/regex-match.js";
import { graderExitCode } from "./code/exit-code.js";
import { graderFileExists } from "./code/file-exists.js";
import { graderToolUsage } from "./code/tool-usage.js";
import { graderTurnCount } from "./code/turn-count.js";
import { graderCostCheck } from "./code/cost-check.js";

// Composite graders
import { graderComposite } from "./composite.js";

// ── LLM grader factory ──────────────────────────────────────────

/** Build an LLM grader from a rubric-building function. */
function makeLlmGrader(
  graderName: string,
  buildRubric: (criterion: Criterion, context: TrialContext) => string
): GraderFn {
  return async (criterion, context, judgeModel) => {
    const rubric = buildRubric(criterion, context);
    const content = formatTranscriptForJudge(context.transcript);
    const result = await invokeJudge({ rubric, content, model: judgeModel });
    return {
      name: criterion.name,
      grader: graderName,
      ...result,
    };
  };
}

function getCriteriaList(criterion: Criterion, context: TrialContext, section: string): string[] {
  const config = criterion.config ?? {};
  if (config.criteria_source === "auto") {
    const ec = context.extracted_criteria;
    if (section === "entry") return ec.entry ?? [];
    if (section === "exit") return ec.exit ?? [];
    if (section === "constraints") return ec.constraints ?? [];
    if (section === "escalation") return ec.escalation_rules ?? [];
    if (section === "rules") return ec.rules ?? [];
    if (section === "capabilities") return ec.capabilities ?? [];
    if (section === "requirements") return ec.requirements ?? [];
    if (section === "acceptance") return ec.acceptance_criteria ?? [];
    return [];
  }
  return (config.criteria as string[]) ?? [];
}

// ── LLM grader rubric builders ───────────────────────────────────

const graderCriteriaAdherence = makeLlmGrader("criteria-adherence", (criterion, context) => {
  const config = criterion.config ?? {};
  const section = (config.section as string) ?? "both";
  const parts: string[] = [];

  if (section === "entry" || section === "both") {
    const items = getCriteriaList(criterion, context, "entry");
    if (items.length) { parts.push("**Entry Criteria:**"); parts.push(...items.map(c => `- ${c}`)); }
  }
  if (section === "exit" || section === "both") {
    const items = getCriteriaList(criterion, context, "exit");
    if (items.length) { parts.push("**Exit Criteria:**"); parts.push(...items.map(c => `- ${c}`)); }
  }

  if (parts.length === 0) return "No criteria found to evaluate.";
  return `Evaluate whether the agent followed these criteria:\n\n${parts.join("\n")}`;
});

const graderConstraintCheck = makeLlmGrader("constraint-check", (criterion, context) => {
  const items = getCriteriaList(criterion, context, "constraints");
  if (items.length === 0) return "Check if the agent violated any constraints during execution.";
  return `Check if the agent violated any of these constraints:\n${items.map(c => `- ${c}`).join("\n")}`;
});

const graderEscalationCheck = makeLlmGrader("escalation-check", (criterion, context) => {
  const items = getCriteriaList(criterion, context, "escalation");
  if (items.length === 0) return "Check if the agent followed escalation rules when needed.";
  return `Check if the agent followed these escalation rules:\n${items.map(c => `- ${c}`).join("\n")}`;
});

const graderRuleAdherence = makeLlmGrader("rule-adherence", (criterion, context) => {
  const items = getCriteriaList(criterion, context, "rules");
  if (items.length === 0) return "Check if the agent followed project rules and conventions.";
  return `Check if the agent followed these project rules:\n${items.map(c => `- ${c}`).join("\n")}`;
});

const graderBehaviorCheck = makeLlmGrader("behavior-check", (criterion) => {
  const config = criterion.config ?? {};
  const expected = (config.expected_behavior as string) ?? "appropriate behavior";
  return `Evaluate whether the agent exhibited the expected behavior: ${expected}`;
});

const graderOutputQuality = makeLlmGrader("output-quality", (criterion) => {
  const config = criterion.config ?? {};
  const rubric = (config.rubric as string) ?? "The output should be complete, correct, and well-formatted.";
  return `Evaluate the quality of the agent's output:\n\n${rubric}`;
});

const graderSpecRequirements = makeLlmGrader("spec-requirements", (criterion, context) => {
  const items = getCriteriaList(criterion, context, "requirements");
  if (items.length === 0) return "Check if the agent fulfilled the spec requirements.";
  return `Check if the agent fulfilled these requirements:\n${items.map(c => `- ${c}`).join("\n")}`;
});

const graderSpecAcceptance = makeLlmGrader("spec-acceptance", (criterion, context) => {
  const items = getCriteriaList(criterion, context, "acceptance");
  if (items.length === 0) return "Check if the agent met the acceptance criteria.";
  return `Check if the agent met these acceptance criteria:\n${items.map(c => `- ${c}`).join("\n")}`;
});

const graderFaithfulnessCheck = makeLlmGrader("faithfulness-check", (criterion) => {
  const config = criterion.config ?? {};
  const sources = (config.sources as string[]) ?? [];
  const sourceText = sources.length > 0 ? `Sources:\n${sources.map(s => `- ${s}`).join("\n")}` : "";
  return `Verify that the agent's claims and outputs are faithful to the provided sources. ${sourceText}`;
});

// ── Registry ─────────────────────────────────────────────────────

const GRADER_REGISTRY: Record<string, GraderFn> = {
  // Code-based
  "trigger-check": graderTriggerCheck,
  "diff-check": graderDiffCheck,
  "json-schema": graderJsonSchema,
  "regex-match": graderRegexMatch,
  "exit-code": graderExitCode,
  "file-exists": graderFileExists,
  "tool-usage": graderToolUsage,
  "turn-count": graderTurnCount,
  "cost-check": graderCostCheck,

  // LLM-as-judge (via claude CLI)
  "criteria-adherence": graderCriteriaAdherence,
  "constraint-check": graderConstraintCheck,
  "escalation-check": graderEscalationCheck,
  "rule-adherence": graderRuleAdherence,
  "behavior-check": graderBehaviorCheck,
  "output-quality": graderOutputQuality,
  "spec-requirements": graderSpecRequirements,
  "spec-acceptance": graderSpecAcceptance,
  "faithfulness-check": graderFaithfulnessCheck,

  // Composite
  "all-of": graderComposite,
  "any-of": graderComposite,
  "weighted": graderComposite,
};

/**
 * Run a grader for a given criterion against a trial context.
 */
export async function runGrader(
  criterion: Criterion,
  context: TrialContext,
  judgeModel: string
): Promise<GraderResult> {
  const graderName = criterion.grader;
  const graderFn = GRADER_REGISTRY[graderName];

  if (!graderFn) {
    return {
      name: criterion.name,
      grader: graderName,
      pass: false,
      score: 0.0,
      reasoning: `Unknown grader: "${graderName}"`,
    };
  }

  try {
    return await graderFn(criterion, context, judgeModel);
  } catch (error) {
    return {
      name: criterion.name,
      grader: graderName,
      pass: false,
      score: 0.0,
      reasoning: `Grader error: ${(error as Error).message}`,
      evidence: { error: (error as Error).stack },
    };
  }
}

/**
 * Get all registered grader names.
 */
export function listGraders(): string[] {
  return Object.keys(GRADER_REGISTRY);
}
