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
  commands?: boolean;
  require?: string[];
  reportUnusedArtifacts?: boolean;
  allProjects?: boolean;
  since?: string;
  limit?: number;
}

/** Repeatable option collector — commander keeps only the last value otherwise. */
function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

async function executeRun(traces: string[], opts: RunFlags) {
  const shared = {
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
    // Same: commander sets this false only for `--no-commands`.
    commands: opts.commands,
    ...(opts.require !== undefined ? { require: opts.require } : {}),
    reportUnusedArtifacts: opts.reportUnusedArtifacts,
  };

  // What decides the report shape is *how traces were selected*, not how many
  // came back. One named trace is a `RunReport`, byte for byte as before; a
  // discovery selector is a `BatchReport` even when it matches exactly one, so
  // a script piping `--format json` gets a stable shape (ADR 01018).
  const selecting =
    opts.allProjects === true ||
    opts.since !== undefined ||
    opts.limit !== undefined;

  if (traces.length > 1 || selecting) {
    const { runBatch } = await import("./commands/batch.js");
    const { report, rendered } = await runBatch({
      ...shared,
      ...(traces.length > 0 ? { traces } : {}),
      ...(opts.allProjects !== undefined
        ? { allProjects: opts.allProjects }
        : {}),
      ...(opts.since !== undefined ? { since: opts.since } : {}),
      ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
    });
    console.log(rendered);
    process.exitCode = report.exitCode;
    return;
  }

  let trace = traces[0];
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
  const { report, rendered } = await runRun({ ...shared, tracePath: trace });
  console.log(rendered);
  process.exitCode = report.exitCode;
}

/**
 * Flags shared by `run` and `calibrate`. `--history` is run-only: calibration
 * is a measurement of a corpus, not a point in one session's timeline, and an
 * accepted flag that quietly does nothing is worse than an absent one.
 */
function addRunFlags(cmd: Command, options: { history?: boolean } = {}): Command {
  const withHistory = options.history !== false;
  const base = cmd
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
    .option(
      "--report-unused-artifacts",
      "list every skill and agent the session was offered and never used",
    )
    .option("--fail-on-needs-review", "treat needs-review as a failure")
    .option("--no-fail-on-needs-review", "do not fail the run on needs-review")
    .option(
      "--no-commands",
      "do not execute command-graded evals; they report skipped",
    )
    .option(
      "--require <module>",
      "load a grader plugin; repeatable, and added to config plugins",
      collect,
    )
    .option("--all-projects", "evaluate every project's traces in the session store")
    .option("--since <duration>", "only traces newer than e.g. 30m, 24h, 7d, 2w")
    .option("--limit <n>", "maximum traces to evaluate", (v) => parseInt(v, 10));
  return withHistory
    ? base.option(
        "--history",
        "append to history and compare with the previous run",
      )
    : base;
}

addRunFlags(
  program
    .command("run [traces...]", { isDefault: true })
    .description(
      "Evaluate one or more traces against the skills and instructions they used",
    ),
).action(executeRun);

// `calibrate` shares `run`'s flags because it *is* a run — plus the labels it
// is measured against. Kept a separate command rather than a flag on `run`:
// the report answers a different question and carries a different shape, and
// a script must be able to tell which it is asking for (ADR 01022).
addRunFlags(
  program
    .command("calibrate [traces...]")
    .description(
      "Measure judged and graded verdicts against a labels file: false passes, false fails, and review volume",
    )
    .option(
      "--labels <file>",
      "calibration labels sidecar (default: calibrate.labels)",
    )
    .option(
      "--sweep",
      "re-score the corpus across the configured grid of zones and ensemble sizes, from cached verdicts",
    )
    .option("--max-false-pass <n>", "exit 1 above this many false passes", (v) =>
      parseInt(v, 10),
    )
    .option("--max-false-fail <n>", "exit 1 above this many false fails", (v) =>
      parseInt(v, 10),
    )
    .option(
      "--max-review <n>",
      "exit 1 above this many needs-review outcomes",
      (v) => parseInt(v, 10),
    ),
  { history: false },
).action(
  async (
    traces: string[],
    opts: RunFlags & {
      labels?: string;
      sweep?: boolean;
      maxFalsePass?: number;
      maxFalseFail?: number;
      maxReview?: number;
    },
  ) => {
    for (const [name, value] of [
      ["--max-false-pass", opts.maxFalsePass],
      ["--max-false-fail", opts.maxFalseFail],
      ["--max-review", opts.maxReview],
    ] as const) {
      // parseInt("abc") is NaN, and every comparison against NaN is false, so
      // a threshold that never trips would look like a threshold that held.
      if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
        throw new TracevalsError(
          `${name} must be a non-negative whole number, got ${value}`,
        );
      }
    }
    const { runCalibrate } = await import("./commands/calibrate.js");
    const { report, rendered } = await runCalibrate({
      ...(traces.length > 0 ? { traces } : {}),
      project: opts.project,
      provider: opts.provider,
      model: opts.model,
      runs: opts.runs,
      deterministicOnly: opts.deterministicOnly,
      noCache: opts.cache === false,
      maxCostUsd: opts.maxCostUsd,
      format: (opts.format as ReportFormat | undefined) ?? "human",
      output: opts.output,
      failOnNeedsReview: opts.failOnNeedsReview,
      reportUnusedArtifacts: opts.reportUnusedArtifacts,
      ...(opts.require !== undefined ? { require: opts.require } : {}),
      ...(opts.allProjects !== undefined ? { allProjects: opts.allProjects } : {}),
      ...(opts.since !== undefined ? { since: opts.since } : {}),
      ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
      ...(opts.labels !== undefined ? { labels: opts.labels } : {}),
      ...(opts.sweep !== undefined ? { sweep: opts.sweep } : {}),
      ...(opts.maxFalsePass !== undefined
        ? { maxFalsePass: opts.maxFalsePass }
        : {}),
      ...(opts.maxFalseFail !== undefined
        ? { maxFalseFail: opts.maxFalseFail }
        : {}),
      ...(opts.maxReview !== undefined ? { maxReview: opts.maxReview } : {}),
    });
    console.log(rendered);
    process.exitCode = report.exitCode;
  },
);

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
  .option(
    "--require <module>",
    "load a grader plugin; repeatable, and added to config plugins",
    collect,
  )
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
    require?: string[];
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
      ...(opts.require !== undefined ? { require: opts.require } : {}),
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
