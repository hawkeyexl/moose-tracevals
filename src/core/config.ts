/**
 * Config loading. Every knob flows config → Ajv validate → defaults → CLI
 * override (`??` at the read site) → runtime; parseConfig() fills every
 * default so downstream code never re-applies one.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";
import configSchemaJson from "./config-schema.json" with { type: "json" };
import { AgentevalsError } from "../types.js";

const configSchema = configSchemaJson as Record<string, unknown>;

export const DEFAULT_CONFIG_FILENAME = "agentevals.config.yaml";

export interface AgentevalsConfig {
  /** Passed through to docevals' provider factory. */
  provider: Record<string, unknown>;
  judge: {
    ensembleRuns: number;
    temperature: number;
    zones: { autoPass: number; autoFail: number };
    cacheDir: string;
    maxCostUsd?: number;
  };
  render: {
    maxBlockChars: number;
    maxTotalChars: number;
  };
  history: {
    file: string;
  };
  fill: {
    /** Minimum self-reported confidence a proposal needs to be written. */
    confidenceThreshold: number;
    maxCriteriaPerArtifact: number;
    temperature: number;
    cacheDir: string;
    maxCostUsd?: number;
  };
  failOnNeedsReview: boolean;
}

const ajv = new Ajv2020({ allErrors: true });
const validate = ajv.compile(configSchema);

export function parseConfig(raw: unknown): AgentevalsConfig {
  if (!validate(raw)) {
    const detail = (validate.errors ?? [])
      .map((e) => `${e.instancePath || "/"} ${e.message}`)
      .join("; ");
    throw new AgentevalsError(`invalid config: ${detail}`);
  }
  const r = raw as Record<string, any>;
  const config: AgentevalsConfig = {
    provider: (r.provider as Record<string, unknown>) ?? {},
    judge: {
      ensembleRuns: r.judge?.ensembleRuns ?? 3,
      temperature: r.judge?.temperature ?? 0,
      zones: {
        autoPass: r.judge?.zones?.autoPass ?? 0.8,
        autoFail: r.judge?.zones?.autoFail ?? 0.8,
      },
      cacheDir: r.judge?.cacheDir ?? ".agentevals/cache",
    },
    render: {
      maxBlockChars: r.render?.maxBlockChars ?? 2000,
      maxTotalChars: r.render?.maxTotalChars ?? 150000,
    },
    history: {
      file: r.history?.file ?? ".agentevals/history.jsonl",
    },
    fill: {
      // 0.7 matches the manuscript's calibration bar for judged agreement.
      confidenceThreshold: r.fill?.confidenceThreshold ?? 0.7,
      maxCriteriaPerArtifact: r.fill?.maxCriteriaPerArtifact ?? 8,
      temperature: r.fill?.temperature ?? 0,
      // Separate from the judge cache: different key scheme and value shape.
      cacheDir: r.fill?.cacheDir ?? ".agentevals/cache/fill",
    },
    failOnNeedsReview: r.failOnNeedsReview ?? true,
  };
  if (typeof r.judge?.maxCostUsd === "number") {
    config.judge.maxCostUsd = r.judge.maxCostUsd;
  }
  if (typeof r.fill?.maxCostUsd === "number") {
    config.fill.maxCostUsd = r.fill.maxCostUsd;
  }
  return config;
}

/** Load the config file from `dir` (cwd by default); absent file = defaults. */
export async function loadConfig(dir = process.cwd()): Promise<AgentevalsConfig> {
  const path = join(dir, DEFAULT_CONFIG_FILENAME);
  let content: string;
  try {
    content = await readFile(path, "utf-8");
  } catch {
    return parseConfig({});
  }
  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch (err) {
    throw new AgentevalsError(
      `could not parse ${path}: ${(err as Error).message}`,
    );
  }
  return parseConfig(raw ?? {});
}
