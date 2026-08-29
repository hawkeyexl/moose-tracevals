/** Human-readable terminal report. */
import pc from "picocolors";
import type { EvalResult, RunReport } from "../types.js";
import type { CoverageEntry } from "../artifacts/types.js";
import {
  availabilityLines,
  availabilityTag,
  coverageLocation,
} from "./coverage.js";

const OUTCOME_LABEL: Record<EvalResult["outcome"], string> = {
  pass: "PASS",
  fail: "FAIL",
  error: "ERROR",
  "needs-review": "REVIEW",
  skipped: "SKIP",
};

function colorFor(outcome: EvalResult["outcome"]): (s: string) => string {
  switch (outcome) {
    case "pass":
      return pc.green;
    case "fail":
    case "error":
      return pc.red;
    case "needs-review":
      return pc.yellow;
    default:
      return pc.dim;
  }
}

/**
 * `✓` resolved, `·` offered and never used (nothing was looked for, so it is
 * not an unresolved reference), `○` referenced but not found.
 */
function coverageMark(entry: CoverageEntry): string {
  if (entry.resolved) return pc.green("✓");
  if (entry.availability === "offered-not-used") return pc.dim("·");
  return pc.yellow("○");
}

export function renderHuman(report: RunReport): string {
  const lines: string[] = [];
  const t = report.trace;
  lines.push(pc.bold(`moose-tracevals — ${t.file}`));
  lines.push(
    pc.dim(
      `${t.source} · ${t.model ?? "unknown model"} · ${t.turnCount} turn(s) · ${t.cwd}`,
    ),
  );
  lines.push("");

  for (const result of report.evalResults) {
    const paint = colorFor(result.outcome);
    const label = paint(OUTCOME_LABEL[result.outcome].padEnd(6));
    const name = `${result.artifactName} › ${result.evalName}`;
    lines.push(`  ${label} ${name}${result.implicit ? pc.dim(" (implicit)") : ""}`);
    for (const finding of result.findings ?? []) {
      if (result.outcome !== "pass" || finding.severity !== "error") {
        lines.push(`         ${pc.dim(`[${finding.severity}]`)} ${finding.message}`);
      }
    }
    if (result.error) lines.push(`         ${pc.red(result.error)}`);
    if (result.skipReason) lines.push(`         ${pc.dim(result.skipReason)}`);
    if (result.consensus && result.outcome !== "pass") {
      const v = result.consensus.votes;
      lines.push(
        `         ${pc.dim(`votes pass:${v.pass} fail:${v.fail} partial:${v.partial} error:${v.error} · confidence ${result.consensus.meanConfidence.toFixed(2)}`)}`,
      );
      const observed = result.consensus.runs.find((r) => r.verdict)?.verdict
        ?.observed;
      if (observed) lines.push(`         ${pc.dim(observed)}`);
    }
  }

  lines.push("");
  lines.push(pc.bold("Artifact coverage"));
  for (const entry of report.coverage) {
    const tag = availabilityTag(entry);
    lines.push(
      `  ${coverageMark(entry)} ${entry.kind}: ${entry.ref}${
        tag === undefined ? "" : ` ${pc.yellow(`[${tag}]`)}`
      } ${pc.dim(coverageLocation(entry))}`,
    );
  }

  lines.push("");
  lines.push(pc.bold("Availability"));
  for (const line of availabilityLines(report.availability)) {
    lines.push(`  ${pc.dim(line)}`);
  }

  if (report.warnings.length > 0) {
    lines.push("");
    lines.push(pc.bold("Warnings"));
    for (const warning of report.warnings) {
      lines.push(`  ${pc.yellow("!")} ${warning}`);
    }
  }

  const s = report.summary;
  lines.push("");
  lines.push(
    pc.bold(
      `${s.total} eval(s): ${pc.green(`${s.pass} pass`)}, ${
        s.fail > 0 ? pc.red(`${s.fail} fail`) : `${s.fail} fail`
      }, ${s.error} error, ${s.needsReview} needs-review, ${s.skipped} skipped`,
    ),
  );
  if (report.costUsd > 0) {
    lines.push(pc.dim(`judge cost $${report.costUsd.toFixed(4)}`));
  }
  return lines.join("\n");
}
