/** Markdown report, suitable for PR comments and docs. */
import type { RunReport } from "../types.js";

export function renderMarkdown(report: RunReport): string {
  const lines: string[] = [];
  const t = report.trace;
  lines.push(`# agentevals report`);
  lines.push("");
  lines.push(`- **Trace**: \`${t.file}\``);
  lines.push(`- **Source**: ${t.source} (${t.model ?? "unknown model"})`);
  lines.push(`- **Project**: \`${t.cwd}\``);
  lines.push(`- **Turns**: ${t.turnCount}`);
  lines.push("");

  lines.push(`## Evals`);
  lines.push("");
  lines.push(`| Outcome | Artifact | Eval | Grader | Detail |`);
  lines.push(`|---|---|---|---|---|`);
  for (const r of report.evalResults) {
    const detail =
      r.error ??
      r.skipReason ??
      r.findings?.map((f) => f.message).join("; ") ??
      (r.consensus
        ? `votes p:${r.consensus.votes.pass} f:${r.consensus.votes.fail} e:${r.consensus.votes.error}`
        : "");
    lines.push(
      `| ${r.outcome} | ${r.artifactName} | ${r.evalName}${r.implicit ? " (implicit)" : ""} | ${r.grader} | ${detail.replace(/\|/g, "\\|")} |`,
    );
  }
  lines.push("");

  lines.push(`## Artifact coverage`);
  lines.push("");
  lines.push(`| Resolved | Kind | Ref | Where |`);
  lines.push(`|---|---|---|---|`);
  for (const entry of report.coverage) {
    const where = entry.resolved
      ? `\`${entry.path}\``
      : (entry.note ?? `not found (${entry.tried.length} tried)`);
    lines.push(
      `| ${entry.resolved ? "yes" : "no"} | ${entry.kind} | ${entry.ref} | ${where} |`,
    );
  }
  lines.push("");

  if (report.warnings.length > 0) {
    lines.push(`## Warnings`);
    lines.push("");
    for (const warning of report.warnings) lines.push(`- ${warning}`);
    lines.push("");
  }

  const s = report.summary;
  lines.push(
    `**${s.total} eval(s)** — ${s.pass} pass, ${s.fail} fail, ${s.error} error, ${s.needsReview} needs-review, ${s.skipped} skipped.`,
  );
  return lines.join("\n");
}
