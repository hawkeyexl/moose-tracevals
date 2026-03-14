#!/usr/bin/env node

/**
 * CLI entry point for agent-evals.
 * Three modes: spec (default), transcript, prompt.
 */

import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { runEvals } from "./index.js";
import type { CLIOptions } from "./types.js";

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      // Spec mode
      trials: { type: "string", short: "t" },
      model: { type: "string", short: "m" },
      "judge-model": { type: "string", short: "j" },
      filter: { type: "string", short: "f" },
      "dry-run": { type: "boolean" },
      bail: { type: "boolean", short: "b" },
      concurrency: { type: "string", short: "c" },
      // Transcript/Prompt mode
      transcript: { type: "string" },
      prompt: { type: "string", short: "p" },
      "detect-criteria": { type: "boolean" },
      // Shared
      output: { type: "string", short: "o" },
      report: { type: "boolean", short: "r" },
      "report-format": { type: "string" },
      history: { type: "boolean" },
      verbose: { type: "boolean", short: "v" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
    },
  });

  if (values.version) {
    console.log("agent-evals v0.2.0");
    process.exit(0);
  }

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  const targetPath = positionals[0] ?? ".";

  const options: CLIOptions = {
    // Spec mode
    path: resolve(targetPath),
    trials: values.trials ? parseInt(values.trials, 10) : undefined,
    model: values.model as string | undefined,
    judge_model: values["judge-model"] as string | undefined,
    filter: values.filter as string | undefined,
    dry_run: values["dry-run"] ?? false,
    verbose: values.verbose ?? false,
    bail: values.bail ?? false,
    concurrency: values.concurrency ? parseInt(values.concurrency, 10) : 1,
    report: values.report ?? false,
    // Transcript/Prompt mode
    transcript: values.transcript as string | undefined,
    prompt: values.prompt as string | undefined,
    detect_criteria: values["detect-criteria"] ?? false,
    // History
    history: values.history ?? false,
    // Report format
    report_format: parseReportFormat(values["report-format"] as string | undefined),
    // Output
    output: values.output ? resolve(values.output as string) : undefined,
  };

  try {
    const exitCode = await runEvals(options);
    process.exit(exitCode);
  } catch (error) {
    console.error(`\nFatal error: ${(error as Error).message}`);
    if (options.verbose) {
      console.error((error as Error).stack);
    }
    process.exit(2);
  }
}

function parseReportFormat(val: string | undefined): "json" | "markdown" | "both" {
  if (val === "markdown" || val === "md") return "markdown";
  if (val === "both") return "both";
  return "json";
}

function printUsage() {
  console.log(`
agent-evals \u2014 Evaluate Claude Code agents, skills, and project rules

Usage:
  agent-evals [path]               Discover & run spec-based evals
  agent-evals --transcript <file>  Evaluate a saved transcript
  agent-evals -p <prompt>          Run prompt via Claude Code, then evaluate

A bare path (no flags) is treated as a directory to discover specs in,
or as a specific spec file to run. Defaults to current directory.

Spec mode options:
  [path]                    Directory to discover specs, or a specific spec file (default: .)
  -t, --trials <n>          Override trial count
  -m, --model <id>          Override model under test
  -f, --filter <pattern>    Filter evals by name
      --dry-run             Parse and validate without executing
  -b, --bail                Stop on first failure
  -c, --concurrency <n>     Parallel eval specs (default: 1)

Transcript mode options:
      --transcript <file>   Path to JSONL transcript file
  -p, --prompt <string>     Prompt to run via claude CLI
      --detect-criteria     Extract criteria from body, compare & merge into frontmatter

Shared options:
  -j, --judge-model <id>    Judge model (default: config or claude-sonnet-4-6)
  -o, --output <dir>        Output directory (default: config or ./eval-results)
  -r, --report              Generate report (use --report-format for format)
      --report-format <fmt> Report format: json, markdown, both (default: json)
      --history             Show trend across all stored runs
  -v, --verbose             Detailed output
  -h, --help                Show this help
      --version             Show version

Examples:
  agent-evals
  agent-evals ./skills/my-skill/
  agent-evals --transcript ./session.jsonl
  agent-evals -p "Generate a test spec for my docs"
  agent-evals --history
`);
}

main();
