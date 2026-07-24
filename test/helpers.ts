import type { Trace } from "../src/trace/types.js";
import type { EvalPlan } from "../src/core/plan.js";
import type { ResolvedArtifact } from "../src/artifacts/types.js";

export function makeTrace(overrides: Partial<Trace> = {}): Trace {
  return {
    source: "claude-code",
    file: "trace.jsonl",
    cwd: "C:\\work\\demo-project",
    events: [],
    toolCalls: [],
    skillInvocations: [],
    agentSpawns: [],
    fileAccesses: [],
    userMessages: [],
    assistantTexts: [],
    turnCount: 0,
    warnings: [],
    ...overrides,
  };
}

export function makeArtifact(
  overrides: Partial<ResolvedArtifact> = {},
): ResolvedArtifact {
  return {
    name: "demo-skill",
    type: "skill",
    path: "C:\\work\\demo-project\\.claude\\skills\\demo-skill\\SKILL.md",
    content: "# Demo",
    origin: "project",
    ...overrides,
  };
}

export function makePlan(overrides: Partial<EvalPlan> = {}): EvalPlan {
  return {
    artifact: makeArtifact(),
    evalName: "demo-eval",
    assertion: "The session did the thing.",
    grader: "llm",
    severity: "error",
    implicit: false,
    ...overrides,
  };
}
