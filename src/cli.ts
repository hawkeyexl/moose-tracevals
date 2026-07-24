/** CLI entry point. Thin commander wrapper; all behavior lives in commands. */
import { createRequire } from "node:module";
import { Command } from "commander";
import { renderList, runList } from "./commands/list.js";
import { AgentevalsError } from "./types.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const program = new Command();

program
  .name("agentevals")
  .description(
    "Deterministic and LLM-as-judge adherence evals for AI agent session traces.",
  )
  .version(version);

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
