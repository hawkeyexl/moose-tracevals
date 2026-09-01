/**
 * Orchestration: parse trace â†’ resolve artifacts â†’ plan evals â†’ deterministic
 * graders â†’ AI judge â†’ aggregate. The judge is injectable so the engine
 * tests fully offline.
 */
import { parseTraceFile } from "../trace/claude.js";
import { resolveArtifacts } from "../artifacts/resolve.js";
import { planEvals, type EvalPlan } from "./plan.js";
import { graderFor, listGraderKinds } from "../graders/registry.js";
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
    if (plan.grader === "ai") {
      aiPlans.push(plan);
      continue;
    }
    // `human` is judged per session: every trace is new, so unlike the page
    // side there is no verdict to cache and nothing to defer to a later run.
    // It reports in deterministic-only runs too â€” a review queue is not an
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

    const grader = graderFor(plan.grader);
    if (!grader) {
      // The grader vocabulary is an open enum: any kebab name validates, and
      // the registry is the authority that rejects it. This is where a stale
      // `llm` â€” the pre-1.0 spelling of `ai` â€” surfaces.
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
      const rendered = renderTrace(trace, config.render);
      const judged = await options.judge(aiPlans, rendered);
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
      ...trace.warnings,
      ...resolved.warnings,
      ...vanityMetricWarnings(plans),
    ],
    coverage: resolved.coverage,
    evalResults: results,
    summary,
    exitCode: failing ? 1 : 0,
    costUsd: results.reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
    durationMs: Date.now() - start,
  };
}

/**
 * Artifacts whose only check is that their skill fired.
 *
 * `claude plugin eval` treats the trigger check as display-only: it reports
 * whether the plugin fired but excludes it from the score in both arms, and
 * its authoring interview refuses to let it stand as a case's only grader.
 * The reasoning transfers exactly — "the skill fired" is not "the session
 * adhered to the skill", and a suite whose only criterion is `skill-invoked`
 * reports coverage while asserting nothing about behavior.
 *
 * A warning rather than an error: it is a statement about how much the suite
 * is worth, not about whether this run is valid.
 */
function vanityMetricWarnings(plans: EvalPlan[]): string[] {
  const byArtifact = new Map<string, EvalPlan[]>();
  for (const plan of plans) {
    if (plan.implicit) continue;
    const list = byArtifact.get(plan.artifact.path) ?? [];
    list.push(plan);
    byArtifact.set(plan.artifact.path, list);
  }
  const warnings: string[] = [];
  for (const [path, group] of byArtifact) {
    if (group.length > 0 && group.every((p) => p.grader === "skill-invoked")) {
      warnings.push(
        `${path}: every eval here is skill-invoked, which checks that the skill fired, ` +
          `not that the session followed it. Add at least one eval about what the ` +
          `session actually did.`,
      );
    }
  }
  return warnings;
}
