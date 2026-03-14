/**
 * JSON reporter — writes structured results to JSON files.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { FullReport, TranscriptEvalReport } from "../types.js";

/**
 * Write a spec-mode report as JSON.
 */
export async function writeJsonReport(report: FullReport, outputDir: string): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, "report.json");
  await writeFile(outputPath, JSON.stringify(report, null, 2), "utf-8");
  return outputPath;
}

/**
 * Write a transcript-mode report as JSON with timestamp.
 */
export async function writeTranscriptJsonReport(report: TranscriptEvalReport, outputDir: string): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const ts = report.timestamp.replace(/[:.]/g, "-").slice(0, 19);
  const outputPath = join(outputDir, `report-${ts}.json`);
  await writeFile(outputPath, JSON.stringify(report, null, 2), "utf-8");

  // Also write as latest
  const latestPath = join(outputDir, "report.json");
  await writeFile(latestPath, JSON.stringify(report, null, 2), "utf-8");

  return outputPath;
}
