/** Shared result model and errors for moose-tracevals. */
import type { ConsensusResult } from "@hawkeyexl/inference";
import type { CoverageEntry } from "./artifacts/types.js";
import type { ArtifactType } from "./artifacts/types.js";
import type { Finding } from "./graders/types.js";

/** Operational error: bad usage, unreadable input, unknown format. Exits 2. */
export class TracevalsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TracevalsError";
  }
}

export type Outcome = "pass" | "fail" | "error" | "needs-review" | "skipped";

export interface EvalResult {
  evalName: string;
  /** Path of the artifact the eval came from. */
  artifact: string;
  artifactName: string;
  artifactType: ArtifactType;
  grader: string;
  implicit: boolean;
  outcome: Outcome;
  /** Present for deterministic evals that produced findings. */
  findings?: Finding[];
  /** Present for judged evals. */
  consensus?: ConsensusResult;
  error?: string;
  skipReason?: string;
  costUsd?: number;
  /**
   * Set when the model that judged this eval also produced what it graded.
   *
   * `session` — the judge model is the model that ran the session. This is the
   * sharpest form of the bias in either moose tool: the judge is not being
   * asked about a document it happened to draft, it is being asked whether its
   * own behavior followed the rules. `criterion` — `eval-provenance` records
   * this model proposing this assertion, so the judge wrote the question.
   *
   * Reported, never fatal: bias skews a verdict, it does not stop one forming,
   * and erroring would punish a single-model setup with no second provider to
   * reach for.
   */
  selfPreference?: { axis: "session" | "criterion"; model: string };
  /**
   * The eval's weight in the run's pass rate. Never changes its own outcome —
   * the binary verdict is what the reporters and exit code consume.
   */
  weight?: number;
  durationMs: number;
}

export interface RunSummary {
  total: number;
  pass: number;
  fail: number;
  error: number;
  needsReview: number;
  skipped: number;
  /**
   * Weighted share of the graded set that passed, 1 when nothing was graded.
   *
   * The graded set is pass + fail + error; `needs-review` and `skipped` are in
   * neither half, so a session awaiting review neither helps nor hurts. Each
   * eval contributes its `weight` (1 unless it says otherwise), which is what
   * lets a secondary check report without dominating.
   *
   * Reported, never gated: moose-tracevals has no suite targets to compare it
   * against, and inventing an exit-code rule around a number nobody configured
   * would be a gate no one asked for.
   */
  passRate: number;
}

export interface RunReport {
  trace: {
    file: string;
    source: string;
    sessionId?: string;
    cwd: string;
    model?: string;
    turnCount: number;
  };
  /** Trace + resolution warnings, surfaced in every format. */
  warnings: string[];
  coverage: CoverageEntry[];
  evalResults: EvalResult[];
  summary: RunSummary;
  /** 0 pass, 1 any fail/error (and needs-review when failOnNeedsReview). */
  exitCode: 0 | 1;
  costUsd: number;
  durationMs: number;
}
