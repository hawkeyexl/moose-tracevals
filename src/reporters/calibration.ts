/**
 * Calibration rendering (ADR 01022).
 *
 * A calibration report answers "was it right?", so the lead is the two kinds
 * of mistake and the volume of deferrals — not a pass rate. Every count is
 * followed by the rows behind it, because "one false pass" with no way to see
 * which eval is a number nobody can act on.
 */
import { isAbsolute, relative } from "node:path";
import pc from "picocolors";
import type {
  CalibrationCounts,
  CalibrationReport,
  Disagreement,
  SweepCell,
} from "../calibrate/types.js";

/** Escapes a value for a markdown table cell; see the note in markdown.ts. */
const cell = (value: string): string => value.replace(/\|/g, "\\|");

/** Last path segment, separator-agnostic so Windows and POSIX agree. */
function basename(file: string): string {
  const parts = file.split(/[\\/]/);
  return parts[parts.length - 1] ?? file;
}

/**
 * Absolute paths are what the report *carries*; they are not what a reader
 * wants to see, and they differ per machine — which would make a captured
 * sample in the docs unreproducible on the next runner.
 */
function display(file: string): string {
  const rel = relative(process.cwd(), file);
  return rel === "" || rel.startsWith("..") || isAbsolute(rel) ? file : rel;
}

const pct = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value * 1000) / 10}%`;

const settingOf = (c: SweepCell): string =>
  `runs=${c.setting.ensembleRuns} autoPass=${c.setting.zones.autoPass} autoFail=${c.setting.zones.autoFail}`;

/** The evidence behind a judged verdict, or nothing for a graded one. */
function evidence(d: Disagreement): string {
  if (d.consensus === undefined) return "";
  const v = d.consensus.votes;
  return `${v.pass}p/${v.fail}f/${v.partial}?/${v.error}e over ${d.consensus.runs} run(s), confidence ${d.consensus.meanConfidence.toFixed(2)}`;
}

const KIND_LABEL: Record<Disagreement["kind"], string> = {
  agree: "AGREE",
  "false-pass": "FALSE-PASS",
  "false-fail": "FALSE-FAIL",
  review: "REVIEW",
  "missed-review": "MISSED-REVIEW",
  error: "ERROR",
  skipped: "SKIPPED",
};

export function renderCalibrationHuman(report: CalibrationReport): string {
  const lines: string[] = [];
  const c = report.counts;
  lines.push(
    pc.bold(
      `moose-tracevals calibrate — ${report.corpus.length} trace(s), ${c.labels} label(s)`,
    ),
  );
  lines.push(
    pc.dim(
      `runs ${report.setting.ensembleRuns} · autoPass ${report.setting.zones.autoPass} · autoFail ${report.setting.zones.autoFail} · labels ${display(report.labelsFile)}`,
    ),
  );
  lines.push("");

  lines.push(
    pc.bold(
      `Agreement ${c.agree}/${c.scored} (${pct(c.agreement)})`,
    ),
  );
  const headline = (
    count: number,
    label: string,
    gloss: string,
    colour: (s: string) => string,
  ): void => {
    const text = `  ${String(count).padStart(4)}  ${label.padEnd(14)} ${pc.dim(gloss)}`;
    lines.push(count > 0 ? colour(text) : pc.dim(text));
  };
  headline(c.falsePass, "false passes", "labelled fail, judged pass — the expensive error", pc.red);
  headline(c.falseFail, "false fails", "labelled pass, judged fail — erodes trust fastest", pc.red);
  headline(c.reviewVolume, "needs-review", "across the whole corpus — the review volume", pc.yellow);
  headline(c.review, "deferred", "labelled pass or fail, routed to a human instead", pc.yellow);
  headline(c.missedReview, "missed reviews", "labelled ambiguous, decided anyway", pc.yellow);
  headline(c.errored, "errors", "the eval could not be graded at all", pc.red);
  headline(c.skipped, "unscored", "labelled, but the eval never armed", (s) => s);

  if (report.disagreements.length > 0) {
    lines.push("");
    lines.push(pc.bold("Disagreements"));
    for (const d of report.disagreements) {
      const tag = KIND_LABEL[d.kind];
      const colour =
        d.kind === "false-pass" || d.kind === "false-fail" || d.kind === "error"
          ? pc.red
          : pc.yellow;
      lines.push(
        `  ${colour(tag.padEnd(14))} ${basename(d.trace)}  ${d.artifactName} › ${d.evalName} ${pc.dim(`(${d.grader})`)}`,
      );
      lines.push(
        `                 ${pc.dim(`expected ${d.expected}, got ${d.actual}`)}${
          evidence(d) === "" ? "" : pc.dim(` · ${evidence(d)}`)
        }`,
      );
      if (d.note !== undefined) {
        lines.push(`                 ${pc.dim(`note: ${d.note}`)}`);
      }
    }
  }

  if (report.unscored.length > 0) {
    lines.push("");
    lines.push(pc.bold("Unscored (no evidence either way)"));
    for (const d of report.unscored) {
      lines.push(
        `  ${pc.dim("SKIPPED".padEnd(14))} ${basename(d.trace)}  ${d.artifactName} › ${d.evalName}`,
      );
      if (d.skipReason !== undefined) {
        lines.push(`                 ${pc.dim(d.skipReason)}`);
      }
    }
  }

  if (report.sweep !== undefined) {
    lines.push("");
    lines.push(pc.bold("Sweep"));
    lines.push(
      pc.dim(
        "  re-scored from the verdicts this run already produced — no further model calls",
      ),
    );
    lines.push(
      pc.dim(
        "  axis                 setting                                 agree  false-pass  false-fail  review  reviewVol",
      ),
    );
    for (const s of report.sweep) {
      lines.push(
        `  ${s.axis.padEnd(20)} ${settingOf(s).padEnd(38)} ${String(s.counts.agree).padStart(5)} ${String(
          s.counts.falsePass,
        ).padStart(11)} ${String(s.counts.falseFail).padStart(11)} ${String(
          s.counts.review,
        ).padStart(7)} ${String(s.counts.reviewVolume).padStart(10)}`,
      );
    }
  }

  if (report.gates.length > 0) {
    lines.push("");
    lines.push(pc.bold("Thresholds"));
    for (const g of report.gates) {
      const text = `  ${g.name}: ${g.actual} of at most ${g.limit}`;
      lines.push(g.exceeded ? pc.red(`${text} — exceeded`) : pc.green(text));
    }
  }

  if (report.warnings.length > 0) {
    lines.push("");
    lines.push(pc.bold("Warnings"));
    for (const w of report.warnings) lines.push(`  ${pc.yellow("!")} ${w}`);
  }

  lines.push("");
  lines.push(
    pc.dim(
      report.exitCode === 0
        ? "Measured cleanly. Disagreement is the finding, not a failure — exit 0."
        : "Exit 1: a threshold was exceeded, or a trace in the corpus could not be evaluated.",
    ),
  );
  if (report.costUsd > 0) {
    lines.push(pc.dim(`judge cost $${report.costUsd.toFixed(4)}`));
  }
  return lines.join("\n");
}

function countsRow(counts: CalibrationCounts): string {
  return `${counts.agree} | ${counts.falsePass} | ${counts.falseFail} | ${counts.review} | ${counts.missedReview} | ${counts.reviewVolume}`;
}

export function renderCalibrationMarkdown(report: CalibrationReport): string {
  const lines: string[] = [];
  const c = report.counts;
  lines.push("# moose-tracevals calibration report");
  lines.push("");
  lines.push(`- **Corpus**: ${report.corpus.length} trace(s), ${c.labels} label(s)`);
  lines.push(
    `- **Setting**: \`ensembleRuns\` ${report.setting.ensembleRuns}, \`zones.autoPass\` ${report.setting.zones.autoPass}, \`zones.autoFail\` ${report.setting.zones.autoFail}`,
  );
  lines.push(`- **Agreement**: ${c.agree}/${c.scored} (${pct(c.agreement)})`);
  lines.push(`- **Labels**: \`${cell(display(report.labelsFile))}\``);
  lines.push("");

  lines.push("| Measure | Count | What it means |");
  lines.push("|---|---|---|");
  lines.push(`| False passes | ${c.falsePass} | Labelled fail, judged pass — the expensive error. |`);
  lines.push(`| False fails | ${c.falseFail} | Labelled pass, judged fail — erodes trust fastest. |`);
  lines.push(`| Review volume | ${c.reviewVolume} | \`needs-review\` across the whole corpus. |`);
  lines.push(`| Deferred labels | ${c.review} | Labelled pass or fail, routed to a human instead. |`);
  lines.push(`| Missed reviews | ${c.missedReview} | Labelled ambiguous, decided anyway. |`);
  lines.push(`| Errors | ${c.errored} | The eval could not be graded at all. |`);
  lines.push(`| Unscored | ${c.skipped} | Labelled, but the eval never armed. |`);
  lines.push("");

  lines.push("## Disagreements");
  lines.push("");
  if (report.disagreements.length === 0) {
    lines.push("None — every scored label agreed.");
  } else {
    lines.push("| Kind | Trace | Artifact | Eval | Grader | Expected | Got | Evidence | Note |");
    lines.push("|---|---|---|---|---|---|---|---|---|");
    for (const d of report.disagreements) {
      lines.push(
        `| ${KIND_LABEL[d.kind]} | \`${cell(basename(d.trace))}\` | ${cell(d.artifactName)} | ${cell(
          d.evalName,
        )} | ${cell(d.grader)} | ${d.expected} | ${d.actual} | ${cell(evidence(d))} | ${cell(d.note ?? "")} |`,
      );
    }
  }
  lines.push("");

  if (report.unscored.length > 0) {
    lines.push("## Unscored");
    lines.push("");
    lines.push("| Trace | Artifact | Eval | Reason |");
    lines.push("|---|---|---|---|");
    for (const d of report.unscored) {
      lines.push(
        `| \`${cell(basename(d.trace))}\` | ${cell(d.artifactName)} | ${cell(d.evalName)} | ${cell(
          d.skipReason ?? "",
        )} |`,
      );
    }
    lines.push("");
  }

  if (report.sweep !== undefined) {
    lines.push("## Sweep");
    lines.push("");
    lines.push(
      "Re-scored from the verdicts this run already produced — no further model calls.",
    );
    lines.push("");
    lines.push(
      "| Axis | Setting | Agree | False passes | False fails | Deferred | Missed reviews | Review volume |",
    );
    lines.push("|---|---|---|---|---|---|---|---|");
    for (const s of report.sweep) {
      lines.push(`| ${s.axis} | ${cell(settingOf(s))} | ${countsRow(s.counts)} |`);
    }
    lines.push("");
  }

  if (report.gates.length > 0) {
    lines.push("## Thresholds");
    lines.push("");
    lines.push("| Threshold | Limit | Actual | Result |");
    lines.push("|---|---|---|---|");
    for (const g of report.gates) {
      lines.push(
        `| ${g.name} | ${g.limit} | ${g.actual} | ${g.exceeded ? "exceeded" : "ok"} |`,
      );
    }
    lines.push("");
  }

  if (report.warnings.length > 0) {
    lines.push("## Warnings");
    lines.push("");
    for (const w of report.warnings) lines.push(`- ${w}`);
    lines.push("");
  }

  lines.push(
    report.exitCode === 0
      ? "Measured cleanly. Disagreement is the finding, not a failure — exit 0."
      : "**Exit 1**: a threshold was exceeded, or a trace in the corpus could not be evaluated.",
  );
  return lines.join("\n");
}
