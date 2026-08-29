/**
 * Config loading. Every knob flows config → Ajv validate → defaults → CLI
 * override (`??` at the read site) → runtime; parseConfig() fills every
 * default so downstream code never re-applies one.
 *
 * Settings live under a `tracevals:` key in `moose.config.yaml`, one file
 * shared by the whole moose family. Sibling keys belong to other tools and are
 * ignored here, so parseConfig() validates the section — never the file root.
 */
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";
import configSchemaJson from "./config-schema.json" with { type: "json" };
import { TracevalsError } from "../types.js";

const configSchema = configSchemaJson as Record<string, unknown>;

export const DEFAULT_CONFIG_FILENAME = "moose.config.yaml";

/**
 * Top-level key holding this tool's settings inside the shared family config.
 * Sibling tools (docevals, docmeta) own their own keys in the same file.
 */
export const CONFIG_SECTION_KEY = "tracevals";

/** Pre-centralization name; detected only to point authors at the new file. */
const LEGACY_CONFIG_FILENAME = "moose-tracevals.config.yaml";

/** Section names this tool owns, read off the schema so they cannot drift. */
const SECTION_KEYS = Object.keys(
  (configSchema.properties ?? {}) as Record<string, unknown>,
);

/** USD per million tokens; overrides the inference library's built-in table. */
export interface Pricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

/**
 * Per-provider settings. Configure as many as you like and select one with
 * `provider.default` or `--provider`; only the selected section is mapped onto
 * the inference library's `ProviderSpec` (see judge/provider.ts).
 */
export interface ProviderConfig {
  default: "anthropic" | "openai" | "claude-cli" | "mock";
  anthropic: { model: string; apiKeyEnv: string; pricing?: Pricing };
  openai: {
    baseUrl: string;
    model: string;
    apiKeyEnv: string;
    pricing?: Pricing;
  };
  "claude-cli": { model: string; command: string };
}

export interface TracevalsConfig {
  provider: ProviderConfig;
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
    maxEvalsPerArtifact: number;
    temperature: number;
    cacheDir: string;
    maxCostUsd?: number;
  };
  failOnNeedsReview: boolean;
  /**
   * Module specifiers imported before evals are planned, so a `registerGrader`
   * call from outside this package lands in time (ADR 01017). Resolved against
   * the config file's directory, in order — a later entry wins a colliding
   * kind. `--require` appends to this list rather than replacing it.
   */
  plugins: string[];
  /** List offered-but-unused artifacts in coverage, not just count them. */
  reportUnusedArtifacts: boolean;
}

const ajv = new Ajv2020({ allErrors: true });
const validate = ajv.compile(configSchema);

export function parseConfig(raw: unknown): TracevalsConfig {
  if (!validate(raw)) {
    const detail = (validate.errors ?? [])
      .map((e) => `${e.instancePath || "/"} ${e.message}`)
      .join("; ");
    throw new TracevalsError(`invalid config: ${detail}`);
  }
  const r = raw as Record<string, any>;
  const config: TracevalsConfig = {
    provider: {
      // claude-cli by default: it uses the local Claude CLI's own auth, so a
      // fresh checkout judges without anyone provisioning an API key.
      default: r.provider?.default ?? "claude-cli",
      anthropic: {
        model: r.provider?.anthropic?.model ?? "claude-sonnet-4-5",
        apiKeyEnv: r.provider?.anthropic?.apiKeyEnv ?? "ANTHROPIC_API_KEY",
        ...(r.provider?.anthropic?.pricing
          ? { pricing: r.provider.anthropic.pricing }
          : {}),
      },
      openai: {
        baseUrl: r.provider?.openai?.baseUrl ?? "https://api.openai.com/v1",
        model: r.provider?.openai?.model ?? "gpt-4o-mini",
        apiKeyEnv: r.provider?.openai?.apiKeyEnv ?? "OPENAI_API_KEY",
        ...(r.provider?.openai?.pricing
          ? { pricing: r.provider.openai.pricing }
          : {}),
      },
      "claude-cli": {
        model: r.provider?.["claude-cli"]?.model ?? "claude-sonnet-4-5",
        command: r.provider?.["claude-cli"]?.command ?? "claude",
      },
    },
    judge: {
      ensembleRuns: r.judge?.ensembleRuns ?? 3,
      temperature: r.judge?.temperature ?? 0,
      zones: {
        autoPass: r.judge?.zones?.autoPass ?? 0.8,
        autoFail: r.judge?.zones?.autoFail ?? 0.8,
      },
      cacheDir: r.judge?.cacheDir ?? ".moose-tracevals/cache",
    },
    render: {
      maxBlockChars: r.render?.maxBlockChars ?? 2000,
      maxTotalChars: r.render?.maxTotalChars ?? 150000,
    },
    history: {
      file: r.history?.file ?? ".moose-tracevals/history.jsonl",
    },
    fill: {
      // 0.7 matches the manuscript's calibration bar for judged agreement.
      confidenceThreshold: r.fill?.confidenceThreshold ?? 0.7,
      maxEvalsPerArtifact: r.fill?.maxEvalsPerArtifact ?? 8,
      temperature: r.fill?.temperature ?? 0,
      // Separate from the judge cache: different key scheme and value shape.
      cacheDir: r.fill?.cacheDir ?? ".moose-tracevals/cache/fill",
    },
    failOnNeedsReview: r.failOnNeedsReview ?? true,
    // Always a list, never undefined: the read site concatenates `--require`
    // onto it, and a hole there would be a special case in every caller.
    plugins: [...(r.plugins ?? [])],
    // An observation, not a gate: listing it is opt-in because a real roster
    // runs to hundreds of skills (ADR 01016).
    reportUnusedArtifacts: r.reportUnusedArtifacts ?? false,
  };
  if (typeof r.judge?.maxCostUsd === "number") {
    config.judge.maxCostUsd = r.judge.maxCostUsd;
  }
  if (typeof r.fill?.maxCostUsd === "number") {
    config.fill.maxCostUsd = r.fill.maxCostUsd;
  }
  return config;
}

/**
 * Load the shared `moose.config.yaml` from `dir` (cwd by default) and return
 * this tool's section. An absent file — or one that carries only other tools'
 * sections — yields defaults.
 */
export async function loadConfig(dir = process.cwd()): Promise<TracevalsConfig> {
  const path = join(dir, DEFAULT_CONFIG_FILENAME);
  let content: string;
  try {
    content = await readFile(path, "utf-8");
  } catch (err) {
    // Only a genuinely absent file means "use defaults". Anything else — a
    // directory by that name, a permission error — would otherwise run on
    // defaults with a config sitting right there, unread and unmentioned.
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR") {
      throw new TracevalsError(
        `could not read ${path}: ${(err as Error).message}`,
      );
    }
    await assertNoOrphanedLegacyConfig(dir);
    return parseConfig({});
  }
  let file: unknown;
  try {
    file = parseYaml(content);
  } catch (err) {
    throw new TracevalsError(
      `could not parse ${path}: ${(err as Error).message}`,
    );
  }
  if (file === null || file === undefined) return parseConfig({});
  if (typeof file !== "object" || Array.isArray(file)) {
    throw new TracevalsError(
      `invalid config: ${path} must be a mapping of tool name to settings`,
    );
  }
  const root = file as Record<string, unknown>;
  if (!(CONFIG_SECTION_KEY in root)) {
    // Defaulting silently here would discard the author's whole config, so a
    // section that is merely misspelled or un-nested is an error, not a shrug.
    const miscased = Object.keys(root).find(
      (key) => key.toLowerCase() === CONFIG_SECTION_KEY,
    );
    if (miscased !== undefined) {
      throw new TracevalsError(
        `invalid config: ${path} has a \`${miscased}:\` section, but the key ` +
          `is case-sensitive — spell it \`${CONFIG_SECTION_KEY}:\``,
      );
    }
    const stray = SECTION_KEYS.filter((key) => key in root);
    if (stray.length > 0) {
      const keys = stray.map((key) => `\`${key}\``).join(", ");
      throw new TracevalsError(
        `invalid config: ${path} has no \`${CONFIG_SECTION_KEY}:\` section, ` +
          `but ${keys} ${stray.length > 1 ? "sit" : "sits"} at the top level ` +
          `— nest ${stray.length > 1 ? "them" : "it"} under \`${CONFIG_SECTION_KEY}:\``,
      );
    }
    return parseConfig({});
  }
  return parseConfig(root[CONFIG_SECTION_KEY] ?? {});
}

/**
 * The pre-centralization file is no longer read. Left alone it would strand a
 * full config with no signal, so say so instead of quietly using defaults.
 */
async function assertNoOrphanedLegacyConfig(dir: string): Promise<void> {
  const legacy = join(dir, LEGACY_CONFIG_FILENAME);
  try {
    await stat(legacy);
  } catch {
    return;
  }
  throw new TracevalsError(
    `invalid config: found ${legacy} but no ${DEFAULT_CONFIG_FILENAME} — ` +
      `rename it to ${DEFAULT_CONFIG_FILENAME} and nest its contents under ` +
      `a \`${CONFIG_SECTION_KEY}:\` key`,
  );
}
