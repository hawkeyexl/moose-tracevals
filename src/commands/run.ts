/** `moose-tracevals run <trace>` — evaluate one trace end to end. */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "../core/config.js";
import { runEvals } from "../core/engine.js";
import {
  appendHistory,
  compareToLast,
  loadHistory,
  type HistoryComparison,
} from "../history.js";
import {
  makeJudgeProvider,
  pricingOverrideFor,
} from "../judge/provider.js";
import { makeTraceJudge, type TraceJudge } from "../judge/trace-judge.js";
import { render, type ReportFormat } from "../reporters/index.js";
import type { RunReport } from "../types.js";

export interface RunCommandOptions {
  tracePath: string;
  project?: string;
  provider?: string;
  model?: string;
  runs?: number;
  deterministicOnly?: boolean;
  noCache?: boolean;
  maxCostUsd?: number;
  format?: ReportFormat;
  output?: string;
  /** Append this run to history and compare against the previous run. */
  history?: boolean;
  /** Directory holding moose-tracevals.config.yaml; defaults to cwd. */
  configDir?: string;
  env?: Record<string, string | undefined>;
  /** Test seam: overrides judge construction entirely. */
  judge?: TraceJudge;
}

export interface RunCommandResult {
  report: RunReport;
  rendered: string;
  comparison?: HistoryComparison;
}

export async function runRun(
  options: RunCommandOptions,
): Promise<RunCommandResult> {
  const configDir = options.configDir ?? process.cwd();
  const config = await loadConfig(configDir);

  let judge = options.judge;
  if (judge === undefined && options.deterministicOnly !== true) {
    const provider = makeJudgeProvider(config, {
      ...(options.provider !== undefined ? { provider: options.provider } : {}),
      ...(options.model !== undefined ? { model: options.model } : {}),
    });
    const maxCostUsd = options.maxCostUsd ?? config.judge.maxCostUsd;
    // Without the configured override, a model the library's built-in price
    // table does not know costs 0, and maxCostUsd would never trip.
    const pricing = pricingOverrideFor(config, {
      ...(options.provider !== undefined ? { provider: options.provider } : {}),
    });
    judge = makeTraceJudge({
      provider,
      runs: options.runs ?? config.judge.ensembleRuns,
      temperature: config.judge.temperature,
      zones: config.judge.zones,
      cacheDir: resolve(configDir, config.judge.cacheDir),
      ...(options.noCache !== undefined ? { noCache: options.noCache } : {}),
      ...(maxCostUsd !== undefined ? { maxCostUsd } : {}),
      ...(pricing !== undefined ? { pricing } : {}),
    });
  }

  const report = await runEvals({
    tracePath: options.tracePath,
    ...(options.project !== undefined ? { projectDir: options.project } : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
    config,
    ...(judge !== undefined ? { judge } : {}),
    ...(options.deterministicOnly !== undefined
      ? { deterministicOnly: options.deterministicOnly }
      : {}),
  });

  let comparison: HistoryComparison | undefined;
  if (options.history) {
    const historyFile = resolve(configDir, config.history.file);
    comparison =
      compareToLast(await loadHistory(historyFile), report) ?? undefined;
    await appendHistory(historyFile, report);
  }

  let rendered = render(report, options.format ?? "human");
  if (comparison && (options.format ?? "human") !== "json") {
    rendered += `\n\n${renderComparison(comparison)}`;
  }
  if (options.output) {
    await writeFile(options.output, rendered, "utf-8");
  }
  return { report, rendered, ...(comparison ? { comparison } : {}) };
}

function renderComparison(comparison: HistoryComparison): string {
  const lines = [`History vs ${comparison.previousTimestamp}:`];
  for (const r of comparison.regressions) {
    lines.push(`  regression: ${r.evalName} (${r.outcome})`);
  }
  for (const i of comparison.improvements) {
    lines.push(`  improvement: ${i.evalName} (${i.outcome})`);
  }
  if (comparison.added.length) lines.push(`  added: ${comparison.added.join(", ")}`);
  if (comparison.removed.length) {
    lines.push(`  removed: ${comparison.removed.join(", ")}`);
  }
  if (lines.length === 1) lines.push("  no changes");
  return lines.join("\n");
}
