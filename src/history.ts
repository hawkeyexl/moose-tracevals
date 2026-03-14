/**
 * Result history — stores eval results and compares across runs.
 */

import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { HistoryEntry, HistoryComparison } from "./types.js";

const HISTORY_FILE = "history.jsonl";

/**
 * Append a history entry to the history file.
 */
export async function appendHistory(entry: HistoryEntry, outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const path = join(outputDir, HISTORY_FILE);
  await appendFile(path, JSON.stringify(entry) + "\n", "utf-8");
}

/**
 * Load all history entries from the history file.
 */
export async function loadHistory(outputDir: string): Promise<HistoryEntry[]> {
  const path = join(outputDir, HISTORY_FILE);
  try {
    const content = await readFile(path, "utf-8");
    const entries: HistoryEntry[] = [];
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line) as HistoryEntry);
      } catch {
        // Skip malformed lines
      }
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * Compare a current run against the most recent prior entry.
 */
export function compareToLast(
  current: HistoryEntry,
  history: HistoryEntry[]
): HistoryComparison | undefined {
  if (history.length === 0) return undefined;

  const previous = history[history.length - 1];
  const regressions: HistoryComparison["regressions"] = [];
  const improvements: HistoryComparison["improvements"] = [];
  const new_criteria: string[] = [];
  const removed_criteria: string[] = [];

  const prevCriteria = previous.per_criterion;
  const currCriteria = current.per_criterion;

  // Check for regressions and improvements
  for (const [name, curr] of Object.entries(currCriteria)) {
    const prev = prevCriteria[name];
    if (!prev) {
      new_criteria.push(name);
      continue;
    }
    if (prev.pass && !curr.pass) {
      regressions.push({ criterion: name, was: prev.score, now: curr.score });
    } else if (!prev.pass && curr.pass) {
      improvements.push({ criterion: name, was: prev.score, now: curr.score });
    }
  }

  // Check for removed criteria
  for (const name of Object.keys(prevCriteria)) {
    if (!(name in currCriteria)) {
      removed_criteria.push(name);
    }
  }

  const score_delta = current.summary.score - previous.summary.score;

  return {
    previous_timestamp: previous.timestamp,
    regressions,
    improvements,
    new_criteria,
    removed_criteria,
    score_delta,
  };
}

/**
 * Build a history entry from spec-mode results.
 */
export function buildSpecHistoryEntry(
  source: string,
  totalCases: number,
  passedCases: number,
  costUsd: number,
  perCriterion: Record<string, { pass: boolean; score: number }>
): HistoryEntry {
  return {
    timestamp: new Date().toISOString(),
    mode: "spec",
    source,
    summary: {
      total: totalCases,
      passed: passedCases,
      failed: totalCases - passedCases,
      score: totalCases > 0 ? passedCases / totalCases : 0,
      cost_usd: costUsd,
    },
    per_criterion: perCriterion,
  };
}

/**
 * Build a history entry from transcript-mode results.
 */
export function buildTranscriptHistoryEntry(
  mode: "transcript" | "prompt",
  source: string,
  total: number,
  passed: number,
  score: number,
  costUsd: number,
  perCriterion: Record<string, { pass: boolean; score: number }>
): HistoryEntry {
  return {
    timestamp: new Date().toISOString(),
    mode,
    source,
    summary: {
      total,
      passed,
      failed: total - passed,
      score,
      cost_usd: costUsd,
    },
    per_criterion: perCriterion,
  };
}

/**
 * Print history trend table.
 */
export function printHistoryTrend(history: HistoryEntry[]): void {
  if (history.length === 0) {
    console.log("No history entries found.");
    return;
  }

  console.log("\nHistory Trend:");
  console.log("─".repeat(80));
  console.log(
    padRight("Timestamp", 24) +
    padRight("Mode", 12) +
    padRight("Total", 8) +
    padRight("Passed", 8) +
    padRight("Score", 8) +
    padRight("Cost", 10)
  );
  console.log("─".repeat(80));

  for (const entry of history) {
    const ts = entry.timestamp.replace("T", " ").slice(0, 19);
    console.log(
      padRight(ts, 24) +
      padRight(entry.mode, 12) +
      padRight(String(entry.summary.total), 8) +
      padRight(String(entry.summary.passed), 8) +
      padRight((entry.summary.score * 100).toFixed(0) + "%", 8) +
      padRight("$" + entry.summary.cost_usd.toFixed(2), 10)
    );
  }
  console.log("─".repeat(80));
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}
