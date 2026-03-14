/**
 * Core type definitions for the agent-evals framework.
 */

// ── Eval Spec (parsed from YAML frontmatter) ─────────────────────

export type ArtifactType = "skill" | "agent" | "project-rules" | "spec";
export type EvalType = "capability" | "regression";
export type CriterionType = "code" | "llm" | "composite";
export type CompositeMode = "all-of" | "any-of" | "weighted";

export interface EvalSpec {
  name: string;
  description: string;
  type: EvalType;
  artifact: ArtifactRef;
  trials: number;
  model: string;
  judge_model: string;
  setup?: string[];
  teardown?: string[];
  sdk_options: RunnerOptions;
  cases: EvalCase[];
  criteria_overrides?: CriteriaOverrides;
}

export interface ArtifactRef {
  type: ArtifactType;
  path: string;
}

export interface RunnerOptions {
  cwd?: string;
  allowed_tools?: string[];
  setting_sources?: string[];
  max_turns?: number;
  max_budget_usd?: number;
  system_prompt?: string;
  plugins?: string[];
  agents?: Record<string, AgentConfig>;
}

export interface AgentConfig {
  load_from?: string;
}

export interface EvalCase {
  name: string;
  prompt: string;
  criteria: Criterion[];
}

export interface Criterion {
  name: string;
  type: CriterionType;
  grader: string;
  config?: Record<string, unknown>;
  sub_criteria?: Criterion[];
  weight?: number;
}

export interface CriteriaOverrides {
  entry?: string[];
  exit?: string[];
  requirements?: string[];
  acceptance_criteria?: string[];
}

// ── Auto-Extracted Criteria ───────────────────────────────────────

export interface ExtractedCriteria {
  entry?: string[];
  exit?: string[];
  process_steps?: string[];
  trigger_description?: string;
  constraints?: string[];
  quality_criteria?: string[];
  escalation_rules?: string[];
  capabilities?: string[];
  tools?: string[];
  rules?: string[];
  gates?: string[];
  conventions?: string[];
  requirements?: string[];
  acceptance_criteria?: string[];
  differentiation?: string[];
  uncertainty_markers?: string[];
  source_references?: string[];
}

// ── Trial & Grading Results ──────────────────────────────────────

export interface GraderResult {
  name: string;
  grader: string;
  pass: boolean;
  score: number;
  reasoning: string;
  evidence?: Record<string, unknown>;
}

export interface TrialResult {
  trial_number: number;
  criteria: GraderResult[];
  pass: boolean;
  transcript_path: string;
  cost_usd: number;
  duration_ms: number;
  num_turns: number;
}

export interface CaseResult {
  name: string;
  trials: TrialResult[];
  pass_at_k: boolean;
  pass_pow_k: boolean;
  per_criterion_pass_rate: Record<string, number>;
}

export interface EvalResult {
  name: string;
  artifact: ArtifactRef;
  type: EvalType;
  cases: CaseResult[];
}

export interface EvalSummary {
  total_cases: number;
  passed: number;
  failed: number;
  pass_rate: number;
  total_cost_usd: number;
  duration_ms: number;
}

export interface FullReport {
  summary: EvalSummary;
  evals: EvalResult[];
  comparison?: HistoryComparison;
}

// ── Grader Interface ─────────────────────────────────────────────

export interface TranscriptMessage {
  type: string;
  role?: string;
  content?: unknown;
  tool_use?: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  };
  tool_result?: {
    tool_use_id: string;
    content: unknown;
  };
  [key: string]: unknown;
}

export interface TrialContext {
  transcript: TranscriptMessage[];
  workspace_before: Map<string, string>;
  workspace_after: Map<string, string>;
  cwd: string;
  cost_usd: number;
  num_turns: number;
  duration_ms: number;
  extracted_criteria: ExtractedCriteria;
}

export interface GraderFn {
  (
    criterion: Criterion,
    context: TrialContext,
    judge_model: string
  ): Promise<GraderResult>;
}

// ── CLI Options ──────────────────────────────────────────────────

export interface CLIOptions {
  // Spec mode
  path: string;
  trials?: number;
  model?: string;
  judge_model?: string;
  filter?: string;
  dry_run: boolean;
  verbose: boolean;
  bail: boolean;
  concurrency: number;
  output?: string;
  report: boolean;
  // Transcript/Prompt mode
  transcript?: string;
  prompt?: string;
  detect_criteria: boolean;
  // History
  history: boolean;
  // Report format
  report_format: "json" | "markdown" | "both";
}

// ── Config (.agent-evals.yaml) ───────────────────────────────────

export interface AgentEvalsConfig {
  judge_model: string;
  output_dir: string;
  verbose: boolean;
  report: "json" | "markdown" | "both";
  pass_threshold: number;
}

// ── Transcript Parsing ───────────────────────────────────────────

export interface ParsedTranscript {
  messages: Record<string, unknown>[];
  cwd: string;
  model: string;
  declared_agents: string[];
  declared_tools: string[];
  invoked_skills: string[];
  spawned_agents: string[];
  accessed_files: string[];
  result?: {
    num_turns: number;
    total_cost_usd: number;
    is_error: boolean;
    subtype: string;
  };
}

// ── Artifact Resolution ──────────────────────────────────────────

export interface ResolvedArtifact {
  name: string;
  type: ArtifactType;
  resolved_path: string;
  content: string;
}

// ── Criteria Assembly ────────────────────────────────────────────

export interface AssembledCriterion {
  text: string;
  source_artifact: string;
  category: string;
  origin: "frontmatter" | "body-extraction";
}

// ── Judging ──────────────────────────────────────────────────────

export interface CriterionJudgment {
  criterion: AssembledCriterion;
  pass: boolean;
  score: number;
  reasoning: string;
  evidence: string;
}

export interface CriterionQuality {
  criterion: AssembledCriterion;
  clarity: number;
  assessability: number;
  suggestion?: string;
}

// ── Transcript Mode Report ───────────────────────────────────────

export interface TranscriptEvalReport {
  timestamp: string;
  source: { type: "transcript" | "prompt"; value: string };
  transcript_summary: {
    cwd: string;
    model: string;
    num_turns: number;
    cost_usd: number;
    status: string;
    skills: string[];
    agents: string[];
  };
  artifacts: Array<{
    name: string;
    type: ArtifactType;
    path: string;
    criteria_count: number;
    criteria_source: string;
  }>;
  judgments: CriterionJudgment[];
  criteria_quality: CriterionQuality[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    score: number;
    pass: boolean;
    mean_clarity: number;
    mean_assessability: number;
    judge_cost_usd: number;
  };
  comparison?: HistoryComparison;
}

// ── History ──────────────────────────────────────────────────────

export interface HistoryEntry {
  timestamp: string;
  mode: "spec" | "transcript" | "prompt";
  source: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    score: number;
    cost_usd: number;
  };
  per_criterion: Record<string, { pass: boolean; score: number }>;
}

export interface HistoryComparison {
  previous_timestamp: string;
  regressions: Array<{ criterion: string; was: number; now: number }>;
  improvements: Array<{ criterion: string; was: number; now: number }>;
  new_criteria: string[];
  removed_criteria: string[];
  score_delta: number;
}
