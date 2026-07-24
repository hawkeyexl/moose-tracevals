/** `agentevals run <trace>` — evaluate one trace end to end. */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "../core/config.js";
import { runEvals } from "../core/engine.js";
import { makeJudgeProvider } from "../judge/provider.js";
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
  /** Directory holding agentevals.config.yaml; defaults to cwd. */
  configDir?: string;
  env?: Record<string, string | undefined>;
  /** Test seam: overrides judge construction entirely. */
  judge?: TraceJudge;
}

export interface RunCommandResult {
  report: RunReport;
  rendered: string;
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
    judge = makeTraceJudge({
      provider,
      runs: options.runs ?? config.judge.ensembleRuns,
      temperature: config.judge.temperature,
      zones: config.judge.zones,
      cacheDir: resolve(configDir, config.judge.cacheDir),
      ...(options.noCache !== undefined ? { noCache: options.noCache } : {}),
      ...(maxCostUsd !== undefined ? { maxCostUsd } : {}),
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

  const rendered = render(report, options.format ?? "human");
  if (options.output) {
    await writeFile(options.output, rendered, "utf-8");
  }
  return { report, rendered };
}
