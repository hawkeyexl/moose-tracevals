/**
 * Orchestration: parse trace → resolve artifacts → plan evals → deterministic
 * graders → LLM judge → aggregate. The judge is injectable so the engine
 * tests fully offline.
 */
import { parseTraceFile } from "../trace/claude.js";
import { resolveArtifacts } from "../artifacts/resolve.js";
import { planEvals, type EvalPlan } from "./plan.js";
import { graderFor } from "../graders/registry.js";
import { renderTrace } from "../judge/render.js";
import type { TraceJudge } from "../judge/trace-judge.js";
import type { TracevalsConfig } from "./config.js";
import type { EvalResult, RunReport, RunSummary } from "../types.js";

export interface EngineOptions {
  tracePath: string;
  /** Artifact-lookup override; when set it is also the parent-walk ceiling. */
  projectDir?: string;
  env?: Record<string, string | undefined>;
  config: TracevalsConfig;
  /** Injected judge; required unless deterministicOnly. */
  judge?: TraceJudge;
  deterministicOnly?: boolean;
}

export async function runEvals(options: EngineOptions): Promise<RunReport> {
  const start = Date.now();
  const { config } = options;

  const trace = await parseTraceFile(options.tracePath);
  const resolved = await resolveArtifacts(trace, {
    ...(options.projectDir !== undefined
      ? { projectDir: options.projectDir, projectRoot: options.projectDir }
      : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
  });
  const plans = await planEvals(resolved.artifacts);

  const results: EvalResult[] = [];
  const llmPlans: EvalPlan[] = [];

  for (const plan of plans) {
    const base = {
      evalName: plan.evalName,
      artifact: plan.artifact.path,
      artifactName: plan.artifact.name,
      artifactType: plan.artifact.type,
      grader: plan.grader,
      implicit: plan.implicit,
    };

    if (plan.error !== undefined) {
      results.push({ ...base, outcome: "error", error: plan.error, durationMs: 0 });
      continue;
    }
    if (plan.skipped) {
      results.push({
        ...base,
        outcome: "skipped",
        skipReason: "artifact skipped via metadata.evals.skip",
        durationMs: 0,
      });
      continue;
    }
    if (plan.grader === "llm") {
      llmPlans.push(plan);
      continue;
    }

    const grader = graderFor(plan.grader);
    if (!grader) {
      results.push({
        ...base,
        outcome: "error",
        error: `unknown grader kind "${plan.grader}"`,
        durationMs: 0,
      });
      continue;
    }
    const graded = Date.now();
    // A grader that throws must fail its own eval, not the whole run: one
    // malformed criterion should never cost the report every other verdict.
    let result;
    try {
      result = await grader.grade({ trace, plan });
    } catch (err) {
      results.push({
        ...base,
        outcome: "error",
        error: `${plan.grader}: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - graded,
      });
      continue;
    }
    if (result.error !== undefined) {
      results.push({
        ...base,
        outcome: "error",
        error: result.error,
        durationMs: Date.now() - graded,
      });
      continue;
    }
    if (result.skipped !== undefined) {
      results.push({
        ...base,
        outcome: "skipped",
        skipReason: result.skipped,
        durationMs: Date.now() - graded,
      });
      continue;
    }
    // Deterministic evals fail only on error-severity findings; warning and
    // info findings report but pass.
    const failing = result.findings.some((f) => f.severity === "error");
    results.push({
      ...base,
      outcome: failing ? "fail" : "pass",
      findings: result.findings,
      durationMs: Date.now() - graded,
    });
  }

  if (llmPlans.length > 0) {
    if (options.deterministicOnly || options.judge === undefined) {
      const skipReason = options.deterministicOnly
        ? "llm evals skipped (deterministic-only run)"
        : "llm evals skipped (no judge provided)";
      for (const plan of llmPlans) {
        results.push({
          evalName: plan.evalName,
          artifact: plan.artifact.path,
          artifactName: plan.artifact.name,
          artifactType: plan.artifact.type,
          grader: plan.grader,
          implicit: plan.implicit,
          outcome: "skipped",
          skipReason,
          durationMs: 0,
        });
      }
    } else {
      const rendered = renderTrace(trace, config.render);
      const judged = await options.judge(llmPlans, rendered);
      judged.forEach((j, i) => {
        const plan = llmPlans[i];
        results.push({
          evalName: j.evalName,
          artifact: j.artifact,
          artifactName: j.artifactName,
          artifactType: plan?.artifact.type ?? "skill",
          grader: j.grader,
          implicit: j.implicit,
          outcome: j.outcome,
          ...(j.consensus !== undefined ? { consensus: j.consensus } : {}),
          ...(j.skipReason !== undefined ? { skipReason: j.skipReason } : {}),
          costUsd: j.costUsd,
          durationMs: j.durationMs,
        });
      });
    }
  }

  const summary: RunSummary = {
    total: results.length,
    pass: results.filter((r) => r.outcome === "pass").length,
    fail: results.filter((r) => r.outcome === "fail").length,
    error: results.filter((r) => r.outcome === "error").length,
    needsReview: results.filter((r) => r.outcome === "needs-review").length,
    skipped: results.filter((r) => r.outcome === "skipped").length,
  };
  const failing =
    summary.fail > 0 ||
    summary.error > 0 ||
    (config.failOnNeedsReview && summary.needsReview > 0);

  return {
    trace: {
      file: trace.file,
      source: trace.source,
      ...(trace.sessionId !== undefined ? { sessionId: trace.sessionId } : {}),
      cwd: trace.cwd,
      ...(trace.model !== undefined ? { model: trace.model } : {}),
      turnCount: trace.turnCount,
    },
    warnings: [...trace.warnings, ...resolved.warnings],
    coverage: resolved.coverage,
    evalResults: results,
    summary,
    exitCode: failing ? 1 : 0,
    costUsd: results.reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
    durationMs: Date.now() - start,
  };
}
