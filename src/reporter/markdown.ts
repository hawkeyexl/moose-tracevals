/**
 * Markdown reporter — generates detailed report.md files.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { FullReport, TranscriptEvalReport, HistoryComparison } from "../types.js";

// ── Spec mode ────────────────────────────────────────────────────

export async function writeMarkdownReport(report: FullReport, outputDir: string): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, "report.md");
  await writeFile(outputPath, generateSpecMarkdown(report), "utf-8");
  return outputPath;
}

function generateSpecMarkdown(report: FullReport): string {
  const lines: string[] = [];
  lines.push("# Eval Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  // Summary table
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Total cases | ${report.summary.total_cases} |`);
  lines.push(`| Passed | ${report.summary.passed} |`);
  lines.push(`| Failed | ${report.summary.failed} |`);
  lines.push(`| Pass rate | ${(report.summary.pass_rate * 100).toFixed(1)}% |`);
  lines.push(`| Total cost | $${report.summary.total_cost_usd.toFixed(2)} |`);
  lines.push(`| Duration | ${formatDuration(report.summary.duration_ms)} |`);
  lines.push("");

  for (const evalResult of report.evals) {
    lines.push(`## ${evalResult.name}`);
    lines.push("");
    lines.push(`**Artifact:** ${evalResult.artifact.type} \u2014 \`${evalResult.artifact.path}\``);
    lines.push(`**Type:** ${evalResult.type}`);
    lines.push("");

    lines.push("| Case | pass@k | pass^k | Criterion Pass Rates |");
    lines.push("|------|--------|--------|---------------------|");

    for (const caseResult of evalResult.cases) {
      const rates = Object.entries(caseResult.per_criterion_pass_rate)
        .map(([name, rate]) => `${name}: ${(rate * 100).toFixed(0)}%`)
        .join(", ");
      lines.push(`| ${caseResult.name} | ${caseResult.pass_at_k ? "Yes" : "No"} | ${caseResult.pass_pow_k ? "Yes" : "No"} | ${rates} |`);
    }
    lines.push("");

    const failed = evalResult.cases.filter((c) => !c.pass_pow_k);
    if (failed.length > 0) {
      lines.push("### Failed Cases");
      lines.push("");
      for (const c of failed) {
        lines.push(`#### ${c.name}`);
        lines.push("");
        for (const trial of c.trials.filter((t) => !t.pass)) {
          lines.push(`**Trial ${trial.trial_number}** (${formatDuration(trial.duration_ms)}, $${trial.cost_usd.toFixed(4)})`);
          lines.push("");
          for (const fc of trial.criteria.filter((cr) => !cr.pass)) {
            lines.push(`- **${fc.name}** (\`${fc.grader}\`): ${fc.reasoning}`);
          }
          lines.push("");
        }
      }
    }
  }

  if (report.comparison) {
    lines.push(...generateComparisonSection(report.comparison));
  }

  return lines.join("\n");
}

// ── Transcript mode ──────────────────────────────────────────────

export async function writeTranscriptMarkdownReport(report: TranscriptEvalReport, outputDir: string): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, "report.md");
  await writeFile(outputPath, generateTranscriptMarkdown(report), "utf-8");
  return outputPath;
}

function generateTranscriptMarkdown(report: TranscriptEvalReport): string {
  const lines: string[] = [];
  lines.push("# Transcript Eval Report");
  lines.push("");
  lines.push(`Generated: ${report.timestamp}`);
  lines.push("");

  // Source
  const src = report.source;
  lines.push(`**Source:** ${src.type === "transcript" ? src.value : `prompt: "${src.value}"`}`);
  lines.push("");

  // Transcript summary
  const ts = report.transcript_summary;
  lines.push("## Session Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Model | ${ts.model} |`);
  lines.push(`| Turns | ${ts.num_turns} |`);
  lines.push(`| Cost | $${ts.cost_usd.toFixed(2)} |`);
  lines.push(`| Status | ${ts.status} |`);
  lines.push(`| Skills | ${ts.skills.join(", ") || "none"} |`);
  lines.push(`| Agents | ${ts.agents.join(", ") || "none"} |`);
  lines.push("");

  // Artifacts
  lines.push("## Artifacts");
  lines.push("");
  lines.push("| Name | Type | Path | Criteria | Source |");
  lines.push("|------|------|------|----------|--------|");
  for (const a of report.artifacts) {
    lines.push(`| ${a.name} | ${a.type} | \`${a.path}\` | ${a.criteria_count} | ${a.criteria_source} |`);
  }
  lines.push("");

  // Adherence
  lines.push("## Criterion Adherence");
  lines.push("");
  lines.push("| Result | Criterion | Score | Source | Category |");
  lines.push("|--------|-----------|-------|--------|----------|");
  for (const j of report.judgments) {
    const icon = j.pass ? "PASS" : "FAIL";
    lines.push(`| ${icon} | ${j.criterion.text} | ${j.score.toFixed(2)} | ${j.criterion.source_artifact} | ${j.criterion.category} |`);
  }
  lines.push("");

  // Quality
  if (report.criteria_quality.length > 0) {
    lines.push("## Criteria Quality");
    lines.push("");
    lines.push(`Avg clarity: ${(report.summary.mean_clarity * 100).toFixed(0)}% | Avg assessability: ${(report.summary.mean_assessability * 100).toFixed(0)}%`);
    lines.push("");
    lines.push("| Criterion | Clarity | Assessability | Suggestion |");
    lines.push("|-----------|---------|---------------|------------|");
    for (const q of report.criteria_quality) {
      lines.push(`| ${q.criterion.text} | ${(q.clarity * 100).toFixed(0)}% | ${(q.assessability * 100).toFixed(0)}% | ${q.suggestion ?? ""} |`);
    }
    lines.push("");
  }

  // Overall
  const s = report.summary;
  lines.push("## Overall");
  lines.push("");
  lines.push(`**${s.passed}/${s.total} passed | Score: ${(s.score * 100).toFixed(0)}% | ${s.pass ? "PASS" : "FAIL"}**`);
  lines.push(`Judge cost: $${s.judge_cost_usd.toFixed(2)}`);
  lines.push("");

  if (report.comparison) {
    lines.push(...generateComparisonSection(report.comparison));
  }

  return lines.join("\n");
}

// ── Shared ───────────────────────────────────────────────────────

function generateComparisonSection(comparison: HistoryComparison): string[] {
  const lines: string[] = [];
  lines.push("## Comparison");
  lines.push("");
  lines.push(`Compared to: ${comparison.previous_timestamp}`);
  lines.push(`Score delta: ${comparison.score_delta >= 0 ? "+" : ""}${(comparison.score_delta * 100).toFixed(0)}%`);
  lines.push("");

  if (comparison.regressions.length > 0) {
    lines.push("### Regressions");
    for (const r of comparison.regressions) {
      lines.push(`- ${r.criterion}: ${(r.was * 100).toFixed(0)}% \u2192 ${(r.now * 100).toFixed(0)}%`);
    }
    lines.push("");
  }

  if (comparison.improvements.length > 0) {
    lines.push("### Improvements");
    for (const r of comparison.improvements) {
      lines.push(`- ${r.criterion}: ${(r.was * 100).toFixed(0)}% \u2192 ${(r.now * 100).toFixed(0)}%`);
    }
    lines.push("");
  }

  return lines;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  return `${m}m ${rem}s`;
}
