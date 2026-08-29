/**
 * Fold N single-trace reports into rates (ADR 01018).
 *
 * "Is this skill working?" is a question about many sessions, and the answer is
 * a proportion. Everything here is pure — reports in, rows out — so the shape
 * of the aggregate is testable without running anything.
 */
import type {
  AggregateCounts,
  AggregateRow,
  BatchReport,
  BatchSummary,
  BatchTraceEntry,
  EvalResult,
  RunReport,
} from "./types.js";

/** A trace that produced a report, or one that could not be read at all. */
export type BatchOutcome =
  | { file: string; report: RunReport }
  | { file: string; error: string; durationMs: number };

const zero = (): AggregateCounts => ({
  pass: 0,
  fail: 0,
  error: 0,
  needsReview: 0,
  skipped: 0,
});

function tally(counts: AggregateCounts, outcome: EvalResult["outcome"]): void {
  if (outcome === "needs-review") counts.needsReview += 1;
  else counts[outcome] += 1;
}

/** Byte-comparison sort, so ordering does not depend on the runner's locale. */
const byKey = (a: { key: string }, b: { key: string }): number =>
  a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

interface Accumulator {
  key: string;
  artifactName: string;
  artifactType: AggregateRow["artifactType"];
  evalName?: string;
  artifacts: Set<string>;
  graders: Set<string>;
  traces: Set<string>;
  counts: AggregateCounts;
  failingTraces: string[];
  reviewTraces: string[];
  skipReasons: Set<string>;
}

function accumulate(
  into: Map<string, Accumulator>,
  key: string,
  result: EvalResult,
  file: string,
  withEvalName: boolean,
): void {
  let row = into.get(key);
  if (row === undefined) {
    row = {
      key,
      artifactName: result.artifactName,
      artifactType: result.artifactType,
      ...(withEvalName ? { evalName: result.evalName } : {}),
      artifacts: new Set(),
      graders: new Set(),
      traces: new Set(),
      counts: zero(),
      failingTraces: [],
      reviewTraces: [],
      skipReasons: new Set(),
    };
    into.set(key, row);
  }
  row.artifacts.add(result.artifact);
  row.graders.add(result.grader);
  row.traces.add(file);
  tally(row.counts, result.outcome);
  if (result.outcome === "fail" || result.outcome === "error") {
    if (!row.failingTraces.includes(file)) row.failingTraces.push(file);
  }
  if (result.outcome === "needs-review" && !row.reviewTraces.includes(file)) {
    row.reviewTraces.push(file);
  }
  if (result.outcome === "skipped" && result.skipReason !== undefined) {
    row.skipReasons.add(result.skipReason);
  }
}

function finish(row: Accumulator, withGraders: boolean): AggregateRow {
  const c = row.counts;
  const total = c.pass + c.fail + c.error + c.needsReview + c.skipped;
  const graded = total - c.skipped;
  return {
    key: row.key,
    artifactName: row.artifactName,
    artifactType: row.artifactType,
    artifacts: [...row.artifacts].sort(),
    ...(row.evalName !== undefined ? { evalName: row.evalName } : {}),
    ...(withGraders ? { graders: [...row.graders].sort() } : {}),
    traces: row.traces.size,
    total,
    counts: { ...c },
    graded,
    passRate: graded > 0 ? c.pass / graded : null,
    failingTraces: [...row.failingTraces],
    reviewTraces: [...row.reviewTraces],
    skipReasons: [...row.skipReasons].sort(),
  };
}

/**
 * Identity for a row. Type and name rather than path: two projects declaring
 * the same skill are one rate, which is the whole point of running a batch.
 */
const artifactKey = (r: EvalResult): string =>
  `${r.artifactType}:${r.artifactName}`;

export function aggregate(
  outcomes: BatchOutcome[],
  options: { warnings?: string[]; durationMs: number },
): BatchReport {
  const artifactRows = new Map<string, Accumulator>();
  const evalRows = new Map<string, Accumulator>();
  const traces: BatchTraceEntry[] = [];

  const summary: BatchSummary = {
    total: 0,
    pass: 0,
    fail: 0,
    error: 0,
    needsReview: 0,
    skipped: 0,
    traces: outcomes.length,
    tracesPassed: 0,
    tracesFailed: 0,
    tracesErrored: 0,
  };
  let costUsd = 0;

  for (const outcome of outcomes) {
    if ("error" in outcome) {
      // A trace that never parsed has no summary to report and no evals to
      // aggregate — but it is still a trace that did not pass, so it counts
      // against the batch and against the exit code.
      traces.push({
        file: outcome.file,
        error: outcome.error,
        warnings: [],
        exitCode: 1,
        costUsd: 0,
        durationMs: outcome.durationMs,
      });
      summary.tracesErrored += 1;
      continue;
    }

    const { report } = outcome;
    traces.push({
      file: outcome.file,
      ...(report.trace.sessionId !== undefined
        ? { sessionId: report.trace.sessionId }
        : {}),
      summary: report.summary,
      warnings: report.warnings,
      exitCode: report.exitCode,
      costUsd: report.costUsd,
      durationMs: report.durationMs,
    });
    if (report.exitCode === 1) summary.tracesFailed += 1;
    else summary.tracesPassed += 1;
    costUsd += report.costUsd;

    summary.total += report.summary.total;
    summary.pass += report.summary.pass;
    summary.fail += report.summary.fail;
    summary.error += report.summary.error;
    summary.needsReview += report.summary.needsReview;
    summary.skipped += report.summary.skipped;

    for (const result of report.evalResults) {
      const base = artifactKey(result);
      accumulate(artifactRows, base, result, outcome.file, false);
      accumulate(
        evalRows,
        `${base}::${result.evalName}`,
        result,
        outcome.file,
        true,
      );
    }
  }

  return {
    traces,
    artifacts: [...artifactRows.values()]
      .map((r) => finish(r, false))
      .sort(byKey),
    evals: [...evalRows.values()].map((r) => finish(r, true)).sort(byKey),
    summary,
    warnings: options.warnings ?? [],
    exitCode:
      summary.tracesFailed > 0 || summary.tracesErrored > 0 ? 1 : 0,
    costUsd,
    durationMs: options.durationMs,
  };
}
