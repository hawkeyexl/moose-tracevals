/**
 * Shared test utilities for agent-evals test suite.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TrialContext, Criterion, TranscriptMessage, ExtractedCriteria } from "../src/types.js";

/**
 * Build a minimal TrialContext with sensible defaults.
 * Override any field via the `overrides` parameter.
 */
export function makeTrialContext(overrides: Partial<TrialContext> = {}): TrialContext {
  return {
    transcript: [],
    workspace_before: new Map(),
    workspace_after: new Map(),
    cwd: "/tmp/test-workspace",
    cost_usd: 0.01,
    num_turns: 5,
    duration_ms: 3000,
    extracted_criteria: {},
    ...overrides,
  };
}

/**
 * Build a minimal Criterion with defaults.
 */
export function makeCriterion(overrides: Partial<Criterion> = {}): Criterion {
  return {
    name: "test-criterion",
    type: "code",
    grader: "trigger-check",
    ...overrides,
  };
}

/**
 * Build a minimal TranscriptMessage.
 */
export function makeTranscriptMsg(overrides: Partial<TranscriptMessage> = {}): TranscriptMessage {
  return {
    type: "assistant",
    ...overrides,
  };
}

/**
 * Create a temporary directory. Returns { dir, cleanup }.
 */
export async function tmpDir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "agent-evals-test-"));
  return {
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
