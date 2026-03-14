/**
 * Config loader — reads .agent-evals.yaml from cwd up to git root.
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import yaml from "js-yaml";
import type { AgentEvalsConfig } from "./types.js";

const CONFIG_FILENAME = ".agent-evals.yaml";

const DEFAULTS: AgentEvalsConfig = {
  judge_model: "claude-sonnet-4-6",
  output_dir: "./eval-results",
  verbose: false,
  report: "json",
  pass_threshold: 0.7,
};

/**
 * Load config by searching from startDir up to git root.
 * Returns merged config (file values override defaults).
 */
export async function loadConfig(startDir: string): Promise<AgentEvalsConfig> {
  const gitRoot = findGitRoot(startDir);
  const configPath = await findConfigFile(startDir, gitRoot);

  if (!configPath) return { ...DEFAULTS };

  try {
    const raw = await readFile(configPath, "utf-8");
    const doc = yaml.load(raw) as Record<string, unknown> | null;
    if (!doc || typeof doc !== "object") return { ...DEFAULTS };

    return {
      judge_model: typeof doc.judge_model === "string" ? doc.judge_model : DEFAULTS.judge_model,
      output_dir: typeof doc.output_dir === "string" ? doc.output_dir : DEFAULTS.output_dir,
      verbose: typeof doc.verbose === "boolean" ? doc.verbose : DEFAULTS.verbose,
      report: isValidReport(doc.report) ? doc.report : DEFAULTS.report,
      pass_threshold: typeof doc.pass_threshold === "number" ? doc.pass_threshold : DEFAULTS.pass_threshold,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function isValidReport(val: unknown): val is "json" | "markdown" | "both" {
  return val === "json" || val === "markdown" || val === "both";
}

function findGitRoot(dir: string): string | null {
  try {
    return execSync("git rev-parse --show-toplevel", { cwd: dir, stdio: "pipe" })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

async function findConfigFile(startDir: string, gitRoot: string | null): Promise<string | null> {
  let current = startDir;
  const seen = new Set<string>();

  while (!seen.has(current)) {
    seen.add(current);
    const candidate = join(current, CONFIG_FILENAME);
    try {
      await readFile(candidate, "utf-8");
      return candidate;
    } catch {
      // Not found, go up
    }

    if (gitRoot && current === gitRoot) break;

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}
