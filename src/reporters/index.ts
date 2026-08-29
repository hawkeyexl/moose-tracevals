/** Report rendering. */
import type { BatchReport, RunReport } from "../types.js";
import { renderBatchHuman, renderBatchMarkdown } from "./batch.js";
import { renderHuman } from "./human.js";
import { renderMarkdown } from "./markdown.js";

export type ReportFormat = "human" | "json" | "markdown";

export function render(report: RunReport, format: ReportFormat): string {
  switch (format) {
    case "json":
      return JSON.stringify(report, null, 2);
    case "markdown":
      return renderMarkdown(report);
    default:
      return renderHuman(report);
  }
}

/**
 * The aggregate counterpart. Kept a separate entry point rather than an
 * overload of `render`, because the two carry different questions and the JSON
 * shapes must stay distinguishable to a downstream consumer (ADR 01018).
 */
export function renderBatch(
  report: BatchReport,
  format: ReportFormat,
): string {
  switch (format) {
    case "json":
      return JSON.stringify(report, null, 2);
    case "markdown":
      return renderBatchMarkdown(report);
    default:
      return renderBatchHuman(report);
  }
}
