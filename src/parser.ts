/**
 * Parse eval specs from:
 *  - Standalone YAML files (full eval spec)
 *  - Frontmatter `evals` array in .md artifact files
 */

import { readFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import yaml from "js-yaml";
import type { EvalSpec, EvalCase, Criterion, ArtifactType, EvalType, CriterionType } from "./types.js";
import type { DiscoveredEvalSource } from "./discovery.js";

const VALID_ARTIFACT_TYPES: ArtifactType[] = ["skill", "agent", "project-rules", "spec"];
const VALID_EVAL_TYPES: EvalType[] = ["capability", "regression"];
const VALID_CRITERION_TYPES: CriterionType[] = ["code", "llm", "composite"];

export class ParseError extends Error {
  constructor(message: string, public file: string) {
    super(`${file}: ${message}`);
    this.name = "ParseError";
  }
}

/**
 * Parse eval specs from a discovered source.
 * Returns one or more EvalSpec objects (frontmatter can contain multiple evals).
 */
export async function parseEvalSource(source: DiscoveredEvalSource): Promise<EvalSpec[]> {
  if (source.source === "standalone") {
    return [await parseStandaloneEvalSpec(source.file)];
  }
  return parseFrontmatterEvals(source.file);
}

// ── Standalone YAML ──────────────────────────────────────────────

/**
 * Parse a standalone YAML eval spec file.
 */
async function parseStandaloneEvalSpec(filePath: string): Promise<EvalSpec> {
  const raw = await readFile(filePath, "utf-8");
  let doc: Record<string, unknown>;

  try {
    doc = yaml.load(raw) as Record<string, unknown>;
  } catch (err) {
    throw new ParseError(`Invalid YAML: ${(err as Error).message}`, filePath);
  }

  if (!doc || typeof doc !== "object") {
    throw new ParseError("YAML must parse to an object", filePath);
  }

  return validateStandaloneEvalSpec(doc, filePath);
}

function validateStandaloneEvalSpec(doc: Record<string, unknown>, file: string): EvalSpec {
  const name = requireString(doc, "name", file);
  const description = requireString(doc, "description", file);
  const type = requireEnum(doc, "type", VALID_EVAL_TYPES, file) as EvalType;

  // Artifact (required for standalone specs)
  const artifactRaw = requireObject(doc, "artifact", file);
  const artifactType = requireEnum(artifactRaw, "type", VALID_ARTIFACT_TYPES, file) as ArtifactType;
  const artifactPath = requireString(artifactRaw, "path", file);

  return buildEvalSpec(doc, file, name, description, type, { type: artifactType, path: artifactPath });
}

// ── Frontmatter ──────────────────────────────────────────────────

/**
 * Parse eval specs from `metadata.evals` in a .md file's YAML frontmatter.
 * The artifact is the file itself — type is inferred or explicit.
 */
async function parseFrontmatterEvals(filePath: string): Promise<EvalSpec[]> {
  const content = await readFile(filePath, "utf-8");

  if (!content.startsWith("---")) {
    throw new ParseError("File does not start with YAML frontmatter", filePath);
  }

  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    throw new ParseError("Unterminated YAML frontmatter", filePath);
  }

  const frontmatterRaw = content.slice(4, endIndex);
  let frontmatter: Record<string, unknown>;

  try {
    frontmatter = yaml.load(frontmatterRaw) as Record<string, unknown>;
  } catch (err) {
    throw new ParseError(`Invalid frontmatter YAML: ${(err as Error).message}`, filePath);
  }

  if (!frontmatter || typeof frontmatter !== "object") {
    throw new ParseError("Frontmatter must parse to an object", filePath);
  }

  // evals lives inside metadata
  const metadata = frontmatter.metadata as Record<string, unknown> | undefined;
  if (!metadata || typeof metadata !== "object") {
    throw new ParseError("frontmatter.metadata is required for evals", filePath);
  }

  const evalsRaw = metadata.evals;
  if (!Array.isArray(evalsRaw) || evalsRaw.length === 0) {
    throw new ParseError("metadata.evals must be a non-empty array", filePath);
  }

  // Infer artifact type from the file, or use explicit `artifact_type`
  const artifactType = inferArtifactType(filePath, frontmatter);
  const artifact = { type: artifactType, path: filePath };

  return evalsRaw.map((evalRaw, i) => {
    if (!evalRaw || typeof evalRaw !== "object") {
      throw new ParseError(`evals[${i}] must be an object`, filePath);
    }
    const doc = evalRaw as Record<string, unknown>;
    const ctx = `evals[${i}]`;

    const name = requireString(doc, "name", filePath, ctx);
    const description = optionalString(doc, "description")
      ?? `Eval "${name}" for ${basename(filePath)}`;
    const type = optionalEnum(doc, "type", VALID_EVAL_TYPES)
      ?? "capability";

    return buildEvalSpec(doc, filePath, name, description, type as EvalType, artifact);
  });
}

/**
 * Infer artifact type from file path and frontmatter.
 */
function inferArtifactType(filePath: string, frontmatter: Record<string, unknown>): ArtifactType {
  // Explicit override in frontmatter
  const explicit = frontmatter.artifact_type as string | undefined;
  if (explicit && VALID_ARTIFACT_TYPES.includes(explicit as ArtifactType)) {
    return explicit as ArtifactType;
  }

  const lower = filePath.toLowerCase();
  const name = basename(lower);

  // Project rules
  if (name === "agents.md" || name === "claude.md") return "project-rules";

  // Path-based inference
  if (lower.includes("/skills/") || lower.includes("\\skills\\")) return "skill";
  if (lower.includes("/agents/") || lower.includes("\\agents\\")) return "agent";
  if (lower.includes("/specs/") || lower.includes("\\specs\\")) return "spec";

  // Frontmatter hints
  if (frontmatter.model !== undefined && frontmatter.description !== undefined) {
    // Agent definitions typically have model + description in frontmatter
    return "agent";
  }

  // Default: if it has skill-like structure (SKILL.md naming)
  if (name === "skill.md") return "skill";

  return "skill"; // safe default
}

// ── Shared builder ───────────────────────────────────────────────

function buildEvalSpec(
  doc: Record<string, unknown>,
  file: string,
  name: string,
  description: string,
  type: EvalType,
  artifact: { type: ArtifactType; path: string }
): EvalSpec {
  const trials = optionalNumber(doc, "trials", 3) ?? 3;
  const model = optionalString(doc, "model", "claude-sonnet-4-6") ?? "claude-sonnet-4-6";
  const judge_model = optionalString(doc, "judge_model", "claude-sonnet-4-6") ?? "claude-sonnet-4-6";

  const setup = optionalStringArray(doc, "setup");
  const teardown = optionalStringArray(doc, "teardown");

  const sdkRaw = optionalObject(doc, "sdk_options") ?? {};
  const sdk_options = {
    cwd: optionalString(sdkRaw, "cwd"),
    allowed_tools: optionalStringArray(sdkRaw, "allowed_tools"),
    setting_sources: optionalStringArray(sdkRaw, "setting_sources"),
    max_turns: optionalNumber(sdkRaw, "max_turns"),
    max_budget_usd: optionalNumber(sdkRaw, "max_budget_usd"),
    system_prompt: optionalString(sdkRaw, "system_prompt"),
    plugins: optionalStringArray(sdkRaw, "plugins"),
    agents: sdkRaw.agents as Record<string, { load_from?: string }> | undefined,
  };

  const casesRaw = requireArray(doc, "cases", file, name);
  const cases = casesRaw.map((c, i) => validateCase(c as Record<string, unknown>, file, i));

  const overridesRaw = optionalObject(doc, "criteria_overrides");
  const criteria_overrides = overridesRaw
    ? {
        entry: optionalStringArray(overridesRaw, "entry"),
        exit: optionalStringArray(overridesRaw, "exit"),
        requirements: optionalStringArray(overridesRaw, "requirements"),
        acceptance_criteria: optionalStringArray(overridesRaw, "acceptance_criteria"),
      }
    : undefined;

  return {
    name,
    description,
    type,
    artifact,
    trials,
    model,
    judge_model,
    setup,
    teardown,
    sdk_options,
    cases,
    criteria_overrides,
  };
}

// ── Case & Criterion validation ──────────────────────────────────

function validateCase(raw: Record<string, unknown>, file: string, index: number): EvalCase {
  const ctx = `cases[${index}]`;
  const name = requireString(raw, "name", file, ctx);
  const prompt = requireString(raw, "prompt", file, ctx);
  const criteriaRaw = requireArray(raw, "criteria", file, ctx);
  const criteria = criteriaRaw.map((c, i) =>
    validateCriterion(c as Record<string, unknown>, file, `${ctx}.criteria[${i}]`)
  );
  return { name, prompt, criteria };
}

function validateCriterion(raw: Record<string, unknown>, file: string, ctx: string): Criterion {
  const name = requireString(raw, "name", file, ctx);
  const type = requireEnum(raw, "type", VALID_CRITERION_TYPES, file, ctx) as CriterionType;
  const grader = requireString(raw, "grader", file, ctx);
  const config = optionalObject(raw, "config") as Record<string, unknown> | undefined;

  const result: Criterion = { name, type, grader };
  if (config) result.config = config;

  if (type === "composite" && raw.sub_criteria) {
    const subRaw = raw.sub_criteria as unknown[];
    result.sub_criteria = subRaw.map((s, i) =>
      validateCriterion(s as Record<string, unknown>, file, `${ctx}.sub_criteria[${i}]`)
    );
  }

  if (raw.weight !== undefined) {
    result.weight = raw.weight as number;
  }

  return result;
}

// ── Validation helpers ───────────────────────────────────────────

function requireString(
  obj: Record<string, unknown>,
  key: string,
  file: string,
  ctx?: string
): string {
  const val = obj[key];
  if (typeof val !== "string" || val.length === 0) {
    throw new ParseError(`${ctx ? ctx + "." : ""}${key} is required and must be a non-empty string`, file);
  }
  return val;
}

function requireEnum<T extends string>(
  obj: Record<string, unknown>,
  key: string,
  valid: T[],
  file: string,
  ctx?: string
): T {
  const val = requireString(obj, key, file, ctx);
  if (!valid.includes(val as T)) {
    throw new ParseError(
      `${ctx ? ctx + "." : ""}${key} must be one of: ${valid.join(", ")} (got "${val}")`,
      file
    );
  }
  return val as T;
}

function optionalEnum<T extends string>(
  obj: Record<string, unknown>,
  key: string,
  valid: T[]
): T | undefined {
  const val = obj[key];
  if (val === undefined || val === null) return undefined;
  if (typeof val !== "string") return undefined;
  if (!valid.includes(val as T)) return undefined;
  return val as T;
}

function requireObject(
  obj: Record<string, unknown>,
  key: string,
  file: string,
  ctx?: string
): Record<string, unknown> {
  const val = obj[key];
  if (!val || typeof val !== "object" || Array.isArray(val)) {
    throw new ParseError(`${ctx ? ctx + "." : ""}${key} is required and must be an object`, file);
  }
  return val as Record<string, unknown>;
}

function requireArray(
  obj: Record<string, unknown>,
  key: string,
  file: string,
  ctx?: string
): unknown[] {
  const val = obj[key];
  if (!Array.isArray(val) || val.length === 0) {
    throw new ParseError(`${ctx ? ctx + "." : ""}${key} is required and must be a non-empty array`, file);
  }
  return val;
}

function optionalString(obj: Record<string, unknown>, key: string, defaultVal?: string): string | undefined {
  const val = obj[key];
  if (val === undefined || val === null) return defaultVal;
  if (typeof val !== "string") return defaultVal;
  return val;
}

function optionalNumber(obj: Record<string, unknown>, key: string, defaultVal?: number): number | undefined {
  const val = obj[key];
  if (val === undefined || val === null) return defaultVal;
  if (typeof val !== "number") return defaultVal;
  return val;
}

function optionalStringArray(obj: Record<string, unknown>, key: string): string[] | undefined {
  const val = obj[key];
  if (!Array.isArray(val)) return undefined;
  return val.filter((v) => typeof v === "string") as string[];
}

function optionalObject(obj: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const val = obj[key];
  if (!val || typeof val !== "object" || Array.isArray(val)) return undefined;
  return val as Record<string, unknown>;
}
