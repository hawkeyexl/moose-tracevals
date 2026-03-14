/**
 * LLM-as-judge — uses `claude -p --json-schema --tools ""` for all judging.
 * Replaces the old Anthropic SDK-based judge.
 */

import { runStructuredPrompt } from "./prompt-runner.js";
import type {
  AssembledCriterion,
  CriterionJudgment,
  CriterionQuality,
  TranscriptMessage,
} from "./types.js";

// ── Adherence Judging ────────────────────────────────────────────

const ADHERENCE_SCHEMA = {
  type: "object",
  properties: {
    pass: { type: "boolean" },
    score: { type: "number" },
    reasoning: { type: "string" },
    evidence: { type: "string" },
  },
  required: ["pass", "score", "reasoning"],
};

/**
 * Judge a single criterion against a transcript.
 * One `claude -p` call per criterion for isolation.
 */
export async function judgeAdherence(
  criterion: AssembledCriterion,
  transcriptText: string,
  model: string
): Promise<CriterionJudgment> {
  const prompt = `You are an expert evaluator for AI agent systems. Evaluate whether the following criterion was adhered to during the agent session.

## Criterion
"${criterion.text}"

Source: ${criterion.source_artifact} [${criterion.category}]
Origin: ${criterion.origin}

## Transcript
${transcriptText}

## Instructions
1. Analyze the transcript for evidence of adherence or violation
2. Score on a 0.0-1.0 scale:
   - 1.0: Fully adhered to
   - 0.7-0.9: Mostly adhered with minor gaps
   - 0.4-0.6: Partially adhered
   - 0.1-0.3: Mostly violated
   - 0.0: Completely violated or not addressed
3. A "pass" requires score >= 0.7
4. Provide specific evidence from the transcript`;

  try {
    const result = await runStructuredPrompt<{
      pass: boolean;
      score: number;
      reasoning: string;
      evidence?: string;
    }>({
      prompt,
      jsonSchema: ADHERENCE_SCHEMA,
      model,
    });

    return {
      criterion,
      pass: result.pass,
      score: Math.min(1, Math.max(0, result.score)),
      reasoning: result.reasoning,
      evidence: result.evidence ?? "",
    };
  } catch (error) {
    return {
      criterion,
      pass: false,
      score: 0,
      reasoning: `Judge error: ${(error as Error).message}`,
      evidence: "",
    };
  }
}

/**
 * Judge multiple criteria in parallel.
 */
export async function judgeAllCriteria(
  criteria: AssembledCriterion[],
  transcriptText: string,
  model: string
): Promise<CriterionJudgment[]> {
  return Promise.all(
    criteria.map((c) => judgeAdherence(c, transcriptText, model))
  );
}

// ── Criteria Quality Scoring ─────────────────────────────────────

const QUALITY_SCHEMA = {
  type: "object",
  properties: {
    scores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          clarity: { type: "number" },
          assessability: { type: "number" },
          suggestion: { type: "string" },
        },
        required: ["index", "clarity", "assessability"],
      },
    },
  },
  required: ["scores"],
};

/**
 * Score the quality of criteria themselves (clarity + assessability).
 * Single batch call for efficiency.
 */
export async function judgeCriteriaQuality(
  criteria: AssembledCriterion[],
  model: string
): Promise<CriterionQuality[]> {
  if (criteria.length === 0) return [];

  const criteriaList = criteria
    .map((c, i) => `${i}. "${c.text}" [source: ${c.source_artifact}, category: ${c.category}]`)
    .join("\n");

  const prompt = `You are an expert evaluator. Score each criterion below for:
- **clarity** (0.0-1.0): How clearly and unambiguously is the criterion stated? 1.0 = no room for interpretation. 0.0 = vague or meaningless.
- **assessability** (0.0-1.0): How easy is it to objectively judge whether the criterion is met from a transcript? 1.0 = binary, observable. 0.0 = purely subjective or unobservable.

If a criterion scores below 0.5 on either dimension, provide a brief suggestion for improvement.

## Criteria
${criteriaList}`;

  try {
    const result = await runStructuredPrompt<{
      scores: Array<{
        index: number;
        clarity: number;
        assessability: number;
        suggestion?: string;
      }>;
    }>({
      prompt,
      jsonSchema: QUALITY_SCHEMA,
      model,
    });

    return result.scores.map((s) => ({
      criterion: criteria[s.index] ?? criteria[0],
      clarity: Math.min(1, Math.max(0, s.clarity)),
      assessability: Math.min(1, Math.max(0, s.assessability)),
      suggestion: s.suggestion,
    }));
  } catch (error) {
    // Return empty quality scores on failure
    return criteria.map((c) => ({
      criterion: c,
      clarity: 0,
      assessability: 0,
      suggestion: `Quality scoring failed: ${(error as Error).message}`,
    }));
  }
}

// ── Spec-mode judge wrapper ──────────────────────────────────────

/**
 * Invoke judge for spec-mode graders (replaces old Anthropic SDK judge).
 * Compatible with the existing grader interface.
 */
export async function invokeJudge(input: {
  rubric: string;
  content: string;
  context?: string;
  model: string;
}): Promise<{ pass: boolean; score: number; reasoning: string }> {
  let prompt = `You are an expert evaluator for AI agent systems.

## RUBRIC
${input.rubric}

## CONTENT
${input.content}`;

  if (input.context) {
    prompt += `\n\n## CONTEXT\n${input.context}`;
  }

  prompt += `\n\nScoring guidelines:
- 1.0: Fully meets all rubric criteria
- 0.7-0.9: Meets most criteria with minor gaps
- 0.4-0.6: Partially meets criteria
- 0.1-0.3: Mostly fails to meet criteria
- 0.0: Completely fails to meet criteria
A "pass" requires a score >= 0.7.`;

  try {
    return await runStructuredPrompt<{ pass: boolean; score: number; reasoning: string }>({
      prompt,
      jsonSchema: ADHERENCE_SCHEMA,
      model: input.model,
    });
  } catch (error) {
    return {
      pass: false,
      score: 0,
      reasoning: `Judge error: ${(error as Error).message}`,
    };
  }
}

/**
 * Format transcript messages into readable text for judging.
 */
export function formatTranscriptForJudge(transcript: TranscriptMessage[]): string {
  const parts: string[] = [];

  for (const msg of transcript) {
    if (msg.type === "error") {
      parts.push(`[ERROR] ${msg.error ?? "Unknown error"}`);
      continue;
    }

    const role = msg.role ?? msg.type ?? "unknown";

    if (typeof msg.content === "string") {
      parts.push(`[${role}] ${msg.content}`);
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content as Array<Record<string, unknown>>) {
        if (block?.type === "text") {
          parts.push(`[${role}] ${block.text}`);
        } else if (block?.type === "tool_use") {
          parts.push(`[${role}:tool_use] ${block.name}(${JSON.stringify(block.input ?? {}).slice(0, 200)})`);
        } else if (block?.type === "tool_result") {
          const content = typeof block.content === "string"
            ? block.content.slice(0, 500)
            : JSON.stringify(block.content ?? "").slice(0, 500);
          parts.push(`[tool_result] ${content}`);
        }
      }
    }

    if (msg.tool_use) {
      parts.push(`[${role}:tool_use] ${msg.tool_use.name}(${JSON.stringify(msg.tool_use.input ?? {}).slice(0, 200)})`);
    }
  }

  return parts.join("\n");
}
