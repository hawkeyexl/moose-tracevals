/** CLI entry point. Thin commander wrapper; all behavior lives in commands. */
import { createRequire } from "node:module";
import { Command } from "commander";
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
