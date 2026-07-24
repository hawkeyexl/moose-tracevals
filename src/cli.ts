/** CLI entry point. Thin commander wrapper; all behavior lives in commands. */
import { createRequire } from "node:module";
import { Command } from "commander";
import { renderList, runList } from "./commands/list.js";
import { runRun } from "./commands/run.js";
import { AgentevalsError } from "./types.js";
import type { ReportFormat } from "./reporters/index.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const program = new Command();

program
  .name("agentevals")
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
}

async function executeRun(trace: string | undefined, opts: RunFlags) {
  if (trace === undefined) {
    // The interactive picker needs a TTY; scripted callers must name a trace.
    if (!process.stdout.isTTY || !process.stdin.isTTY) {
      throw new AgentevalsError(
        "no trace given; pass a trace file or run `agentevals list`",
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
    .option("--history", "append to history and compare with the previous run");
}

addRunFlags(
  program
    .command("run [trace]", { isDefault: true })
    .description("Evaluate a trace against the skills and instructions it used"),
).action(executeRun);

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
  if (err instanceof AgentevalsError) {
    console.error(`agentevals: ${err.message}`);
    process.exitCode = 2;
  } else {
    throw err;
  }
}
