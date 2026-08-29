/**
 * Orchestration: parse trace → resolve artifacts → plan evals → deterministic
 * graders → AI judge → aggregate. The judge is injectable so the engine
 * tests fully offline.
 */
import { parseTraceFile } from "../trace/claude.js";
import { resolveArtifacts } from "../artifacts/resolve.js";
import { planEvals, type EvalPlan } from "./plan.js";
import { graderFor, listGraderKinds } from "../graders/registry.js";
import { windowFor } from "../graders/util.js";
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
  /**
   * Warnings raised before the engine ran — grader-plugin loading is the one
   * source today. They belong in the report because they change how a verdict
   * should be read, and they happened first, so they lead the list.
   */
  warnings?: string[];
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
    reportUnusedArtifacts: config.reportUnusedArtifacts,
  });
  const plans = await planEvals(resolved.artifacts);

  const results: EvalResult[] = [];
  const aiPlans: EvalPlan[] = [];

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
        skipReason: plan.skipReason ?? "eval skipped",
        durationMs: 0,
      });
      continue;
    }
    // An artifact that governed no turn in this trace grades nothing. Saying
    // so is the only honest outcome: a judge handed an empty window would
    // answer about the parent session's work, and a `human` reviewer would be
    // queued to review nothing (ADR 01015). Deterministic graders make the
    // same call for themselves, since only they know whether they are windowed.
    if (plan.grader === "ai" || plan.grader === "human") {
      const window = windowFor(trace, plan);
      if (window.empty) {
        results.push({
          ...base,
          outcome: "skipped",
          skipReason: window.reason ?? "the artifact governed no turns",
          durationMs: 0,
        });
        continue;
      }
    }
    if (plan.grader === "ai") {
      aiPlans.push(plan);
      continue;
    }
    // `human` is judged per session: every trace is new, so unlike the page
    // side there is no verdict to cache and nothing to defer to a later run.
    // It reports in deterministic-only runs too — a review queue is not an
    // inference call.
    if (plan.grader === "human") {
      results.push({
        ...base,
        outcome: "needs-review",
        skipReason: "awaiting human review",
        durationMs: 0,
      });
      continue;
    }

    // The one grader that executes something. ADR 01011 keeps it on by
    // default; ADR 01019 gives the person taking that risk a lever. A disabled
    // check is `skipped` with a reason, never `pass`: an unrun check has not
    // been satisfied.
    if (plan.grader === "command" && !config.graders.command.enabled) {
      results.push({
        ...base,
        outcome: "skipped",
        skipReason:
          "command execution is disabled (--no-commands / graders.command.enabled: false)",
        durationMs: 0,
      });
      continue;
    }

    const grader = graderFor(plan.grader);
    if (!grader) {
      // The grader vocabulary is an open enum: any kebab name validates, and
      // the registry is the authority that rejects it. This is where a stale
      // `llm` — the pre-1.0 spelling of `ai` — surfaces.
      results.push({
        ...base,
        outcome: "error",
        error: `unknown grader kind "${plan.grader}"; the grader registry knows ${listGraderKinds().sort().join(", ")}, "ai", and "human"`,
        durationMs: 0,
      });
      continue;
    }
    const graded = Date.now();
    // A grader that throws must fail its own eval, not the whole run: one
    // malformed eval should never cost the report every other verdict.
    let result;
    try {
      result = await grader.grade({
        trace,
        plan,
        ...(options.projectDir !== undefined
          ? { projectRoot: options.projectDir }
          : {}),
      });
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

  if (aiPlans.length > 0) {
    if (options.deterministicOnly || options.judge === undefined) {
      const skipReason = options.deterministicOnly
        ? "ai evals skipped (deterministic-only run)"
        : "ai evals skipped (no judge provided)";
      for (const plan of aiPlans) {
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
      // `judge.redact` rides along with the render caps: the digest is the one
      // thing that leaves the machine, so its size limits and its redaction
      // list are decided in the same place (ADR 01020).
      const judged = await options.judge(aiPlans, (plan) =>
        renderTrace(
          trace,
          { ...config.render, redact: config.judge.redact },
          plan,
        ),
      );
      judged.forEach((j, i) => {
        const plan = aiPlans[i];
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
          ...(j.error !== undefined ? { error: j.error } : {}),
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
    warnings: [
      ...(options.warnings ?? []),
      ...trace.warnings,
      ...resolved.warnings,
    ],
    coverage: resolved.coverage,
    // An observation about the session's configuration, never a verdict: it is
    // deliberately not part of `summary` and never moves `exitCode`.
    availability: resolved.availability,
    evalResults: results,
    summary,
    exitCode: failing ? 1 : 0,
    costUsd: results.reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
    durationMs: Date.now() - start,
  };
}
