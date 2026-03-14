/**
 * CLI reporter — prints summary tables to stdout for both spec and transcript modes.
 */

import type {
  FullReport,
  CaseResult,
  TranscriptEvalReport,
  HistoryComparison,
  CriterionJudgment,
  CriterionQuality,
} from "../types.js";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

// ── Spec mode report ─────────────────────────────────────────────

export function printCliReport(report: FullReport): void {
  console.log(`\nagent-evals v0.2.0\n`);
  console.log(`Running ${report.evals.length} eval spec(s)...\n`);

  for (const evalResult of report.evals) {
    console.log(` ${evalResult.name} (${evalResult.artifact.type})`);

    for (const caseResult of evalResult.cases) {
      const passedTrials = caseResult.trials.filter((t) => t.pass).length;
      const totalTrials = caseResult.trials.length;
      const graderNames = getGraderNames(caseResult);

      const icon = caseResult.pass_pow_k ? "\u2713" : "\u2717";
      const color = caseResult.pass_pow_k ? GREEN : RED;

      console.log(
        `  ${color}${icon}${RESET} ${padRight(caseResult.name, 40)} ${passedTrials}/${totalTrials} trials passed  [${graderNames}]`
      );

      if (!caseResult.pass_pow_k) {
        for (const trial of caseResult.trials) {
          if (trial.pass) continue;
          for (const fc of trial.criteria.filter((c) => !c.pass)) {
            console.log(`    \u2514 Trial ${trial.trial_number}: ${fc.grader} FAIL \u2014 "${fc.reasoning}"`);
          }
        }
      }
    }
    console.log();
  }

  const { summary } = report;
  const color = summary.failed === 0 ? GREEN : RED;
  console.log(`${color}Results: ${summary.total_cases} cases, ${summary.passed} passed, ${summary.failed} failed${RESET}`);
  console.log(`Cost: $${summary.total_cost_usd.toFixed(2)} | Duration: ${formatDuration(summary.duration_ms)}`);

  if (report.comparison) {
    printComparison(report.comparison);
  }
}

// ── Transcript mode report ───────────────────────────────────────

export function printTranscriptReport(report: TranscriptEvalReport): void {
  console.log(`\nagent-evals v0.2.0\n`);

  const src = report.source;
  const srcLabel = src.type === "transcript" ? src.value : `prompt: "${src.value.slice(0, 60)}"`;
  const ts = report.transcript_summary;
  console.log(`Source: ${srcLabel} (${ts.num_turns} turns, $${ts.cost_usd.toFixed(2)})`);

  const artifactCounts = new Map<string, number>();
  for (const a of report.artifacts) {
    artifactCounts.set(a.type, (artifactCounts.get(a.type) ?? 0) + 1);
  }
  const artifactDesc = [...artifactCounts.entries()].map(([t, n]) => `${n} ${t}`).join(", ");
  console.log(`Artifacts: ${report.artifacts.length} found (${artifactDesc})`);

  const fmCount = report.judgments.filter((j) => j.criterion.origin === "frontmatter").length;
  const bodyCount = report.judgments.filter((j) => j.criterion.origin === "body-extraction").length;
  console.log(`Criteria: ${report.judgments.length} assembled (${fmCount} frontmatter, ${bodyCount} body-extracted)`);
  console.log();

  // Criterion adherence table
  console.log("Criterion Adherence:");
  for (const j of report.judgments) {
    const icon = j.pass ? "PASS" : "FAIL";
    const color = j.pass ? GREEN : RED;
    console.log(
      `  ${color}${icon}${RESET}  ${padRight(j.criterion.text.slice(0, 42), 42)} ${padRight(j.score.toFixed(2), 6)} ${padRight(j.criterion.source_artifact, 28)} [${j.criterion.category}]`
    );
  }
  console.log();

  // Criteria quality
  if (report.criteria_quality.length > 0) {
    printCriteriaQuality(report.criteria_quality, report.summary.mean_clarity, report.summary.mean_assessability);
  }

  // Overall
  const { summary } = report;
  const overallColor = summary.pass ? GREEN : RED;
  const overallLabel = summary.pass ? "PASS" : "FAIL";
  console.log(`${overallColor}Overall: ${summary.passed}/${summary.total} passed | Score: ${(summary.score * 100).toFixed(0)}% | ${overallLabel}${RESET}`);
  console.log(`Judge cost: $${summary.judge_cost_usd.toFixed(2)}`);

  if (report.comparison) {
    printComparison(report.comparison);
  }
}

// ── Criteria quality ─────────────────────────────────────────────

function printCriteriaQuality(
  quality: CriterionQuality[],
  meanClarity: number,
  meanAssessability: number
): void {
  console.log("Criteria Quality:");
  console.log(`  Avg clarity: ${(meanClarity * 100).toFixed(0)}% | Avg assessability: ${(meanAssessability * 100).toFixed(0)}%`);

  const low = quality.filter((q) => q.assessability < 0.5 || q.clarity < 0.5);
  for (const q of low) {
    const dim = q.assessability < 0.5 ? "assessability" : "clarity";
    const val = dim === "assessability" ? q.assessability : q.clarity;
    const suggestion = q.suggestion ? ` \u2014 "${q.suggestion}"` : "";
    console.log(`  ${YELLOW}Low ${dim}: "${q.criterion.text.slice(0, 40)}" (${(val * 100).toFixed(0)}%)${suggestion}${RESET}`);
  }
  console.log();
}

// ── Comparison ───────────────────────────────────────────────────

function printComparison(comparison: HistoryComparison): void {
  console.log();
  const deltaStr = comparison.score_delta >= 0
    ? `${GREEN}+${(comparison.score_delta * 100).toFixed(0)}%${RESET}`
    : `${RED}${(comparison.score_delta * 100).toFixed(0)}%${RESET}`;
  console.log(`Comparison to ${comparison.previous_timestamp.slice(0, 19)}: ${deltaStr}`);

  if (comparison.regressions.length > 0) {
    console.log(`  ${RED}Regressions:${RESET}`);
    for (const r of comparison.regressions) {
      console.log(`    \u2717 ${r.criterion} (${(r.was * 100).toFixed(0)}% \u2192 ${(r.now * 100).toFixed(0)}%)`);
    }
  }
  if (comparison.improvements.length > 0) {
    console.log(`  ${GREEN}Improvements:${RESET}`);
    for (const r of comparison.improvements) {
      console.log(`    \u2713 ${r.criterion} (${(r.was * 100).toFixed(0)}% \u2192 ${(r.now * 100).toFixed(0)}%)`);
    }
  }
  if (comparison.new_criteria.length > 0) {
    console.log(`  ${DIM}New criteria: ${comparison.new_criteria.join(", ")}${RESET}`);
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function getGraderNames(caseResult: CaseResult): string {
  if (caseResult.trials.length === 0) return "";
  return caseResult.trials[0].criteria.map((c) => c.grader).join(", ");
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(0)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  return `${m}m ${rem}s`;
}
