/** Shared result model and errors for agentevals. */
import type { ConsensusResult } from "@hawkeyexl/inference";
import type { CoverageEntry } from "./artifacts/types.js";
import type { ArtifactType } from "./artifacts/types.js";
import type { Finding } from "./graders/types.js";

/** Operational error: bad usage, unreadable input, unknown format. Exits 2. */
export class AgentevalsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentevalsError";
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
  durationMs: number;
}

export interface RunSummary {
  total: number;
  pass: number;
  fail: number;
  error: number;
  needsReview: number;
  skipped: number;
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
