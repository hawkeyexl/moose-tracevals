/** Report rendering. */
import type { RunReport } from "../types.js";
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
