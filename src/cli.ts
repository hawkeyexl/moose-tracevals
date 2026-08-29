/** CLI entry point. Thin commander wrapper; all behavior lives in commands. */
import { createRequire } from "node:module";
import { Command } from "commander";
import { renderList, runList } from "./commands/list.js";
import { renderFill, runFill } from "./commands/fill.js";
import { runRun } from "./commands/run.js";
import { TracevalsError } from "./types.js";
import type { ReportFormat } from "./reporters/index.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const program = new Command();

program
  .name("moose-tracevals")
  .description(
    "Deterministic and LLM-as-judge adherence evals for AI agent session traces.",
  )
  .version(version);

interface RunFlags {
  project?: string;
  provider?: string;
  model?: string;
  runs?: number;
  deterministicOnly?: boolean;
  cache?: boolean;
  maxCostUsd?: number;
  format?: string;
  output?: string;
  history?: boolean;
  failOnNeedsReview?: boolean;
}

async function executeRun(trace: string | undefined, opts: RunFlags) {
  if (trace === undefined) {
    // The interactive picker needs a TTY; scripted callers must name a trace.
    if (!process.stdout.isTTY || !process.stdin.isTTY) {
      throw new TracevalsError(
        "no trace given; pass a trace file or run `moose-tracevals list`",
      );
    }
    const { pickTrace } = await import("./trace/picker.js");
    trace = await pickTrace();
  }
  const { report, rendered } = await runRun({
    tracePath: trace,
    project: opts.project,
    provider: opts.provider,
    model: opts.model,
    runs: opts.runs,
    deterministicOnly: opts.deterministicOnly,
    noCache: opts.cache === false,
    maxCostUsd: opts.maxCostUsd,
    format: (opts.format as ReportFormat | undefined) ?? "human",
    output: opts.output,
    history: opts.history,
    // Left undefined when neither flag is passed, so the config still decides.
    failOnNeedsReview: opts.failOnNeedsReview,
  });
  console.log(rendered);
  process.exitCode = report.exitCode;
}

function addRunFlags(cmd: Command): Command {
  return cmd
    .option(
      "--project <dir>",
      "artifact-lookup root (overrides the trace's recorded cwd)",
    )
    .option("--provider <name>", "judge provider: claude-cli, anthropic, openai, mock")
    .option("--model <model>", "judge model override")
    .option("--runs <n>", "ensemble runs per eval", (v) => parseInt(v, 10))
    .option("--deterministic-only", "skip LLM-judged evals")
    .option("--no-cache", "bypass the judge cache")
    .option("--max-cost-usd <usd>", "judge cost budget", (v) => parseFloat(v))
    .option("-f, --format <format>", "human | json | markdown", "human")
    .option("-o, --output <file>", "also write the report to a file")
    .option("--history", "append to history and compare with the previous run")
    .option("--fail-on-needs-review", "treat needs-review as a failure")
    .option("--no-fail-on-needs-review", "do not fail the run on needs-review");
}

addRunFlags(
  program
    .command("run [trace]", { isDefault: true })
    .description("Evaluate a trace against the skills and instructions it used"),
).action(executeRun);

program
  .command("fill [paths...]")
  .description(
    "Propose evals for skills, agent definitions, and project rules, and write those above the confidence threshold",
  )
  .option("--project <dir>", "project root to scan (default: current directory)")
  .option("--dry-run", "report proposals without writing them")
  .option(
    "--confidence <n>",
    "minimum confidence to write (0-1)",
    (v) => parseFloat(v),
  )
  .option(
    "--max-evals <n>",
    "maximum evals per artifact, including existing ones",
    (v) => parseInt(v, 10),
  )
  .option("--max-cost-usd <usd>", "proposal cost budget", (v) => parseFloat(v))
  .option("--no-cache", "bypass the proposal cache")
  .option("--provider <name>", "provider: claude-cli, anthropic, openai, mock")
  .option("--model <model>", "model override")
  .option("-f, --format <format>", "human | json", "human")
  .action(async (paths: string[], opts: {
    project?: string;
    dryRun?: boolean;
    confidence?: number;
    maxEvals?: number;
    maxCostUsd?: number;
    cache?: boolean;
    provider?: string;
    model?: string;
    format?: string;
  }) => {
    // parseFloat("abc") is NaN, and every comparison against NaN is false —
    // so range checks must test for a finite number, not just the range.
    const numeric = (
      name: string,
      value: number | undefined,
      min: number,
      max: number,
    ): void => {
      if (value === undefined) return;
      if (!Number.isFinite(value) || value < min || value > max) {
        throw new TracevalsError(
          `${name} must be a number between ${min} and ${max}, got ${value}`,
        );
      }
    };
    numeric("--confidence", opts.confidence, 0, 1);
    numeric("--max-evals", opts.maxEvals, 1, Number.MAX_SAFE_INTEGER);
    numeric("--max-cost-usd", opts.maxCostUsd, 0, Number.MAX_SAFE_INTEGER);

    const { report, rendered } = await runFill({
      ...(paths.length > 0 ? { paths } : {}),
      ...(opts.project !== undefined ? { project: opts.project } : {}),
      ...(opts.dryRun !== undefined ? { dryRun: opts.dryRun } : {}),
      ...(opts.confidence !== undefined ? { confidence: opts.confidence } : {}),
      ...(opts.maxEvals !== undefined ? { maxEvals: opts.maxEvals } : {}),
      ...(opts.maxCostUsd !== undefined ? { maxCostUsd: opts.maxCostUsd } : {}),
      ...(opts.cache === false ? { noCache: true } : {}),
      ...(opts.provider !== undefined ? { provider: opts.provider } : {}),
      ...(opts.model !== undefined ? { model: opts.model } : {}),
    });
    console.log(
      opts.format === "json" ? JSON.stringify(report, null, 2) : rendered,
    );
    process.exitCode = report.exitCode;
  });

program
  .command("list")
  .description("List discoverable traces (Claude Code session files)")
  .option(
    "-p, --project <dir>",
    "project directory to scope to (default: current directory)",
  )
  .option("-a, --all-projects", "scan every project in the session store")
  .option("-l, --limit <n>", "maximum traces to list", (v) => parseInt(v, 10))
  .option("--json", "emit JSON instead of a table")
  .action(async (opts: {
    project?: string;
    allProjects?: boolean;
    limit?: number;
    json?: boolean;
  }) => {
    const run = await runList({
      project: opts.project,
      allProjects: opts.allProjects,
      limit: opts.limit,
    });
    if (opts.json) {
      console.log(JSON.stringify(run, null, 2));
    } else {
      console.log(renderList(run));
    }
  });

try {
  await program.parseAsync(process.argv);
} catch (err) {
  if (err instanceof TracevalsError) {
    console.error(`moose-tracevals: ${err.message}`);
    process.exitCode = 2;
  } else {
    throw err;
  }
}
