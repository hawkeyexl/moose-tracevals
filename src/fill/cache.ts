/**
 * Fill proposal cache: content-addressed JSON holding the raw, *pre-gating*
 * proposal. Two consequences are the point of the design:
 *
 * - Re-running with a different `--confidence` re-gates from cache, so tuning
 *   the threshold costs no tokens.
 * - The existing criterion-name set is part of the key, so a re-run after a
 *   fill misses and asks the model for *additional* coverage rather than
 *   replaying a proposal that has already been applied.
 *
 * Kept in its own directory: the judge cache has a different key scheme and
 * value shape, and the two must never be read into each other.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "../judge/cache.js";
import type { ArtifactType } from "../artifacts/types.js";
import { FILL_PROMPT_VERSION, isValidProposal } from "./prompt.js";

export interface FillCacheKeyParts {
  provider: string;
  model: string;
  temperature: number;
  maxCriteria: number;
  artifactType: ArtifactType;
  /** Artifact path — it appears in the prompt, so it belongs in the key. */
  path: string;
  /** Full artifact content, hashed. */
  body: string;
  existingNames: string[];
  /**
   * Project-wide skill names. They are the grounding vocabulary in the
   * prompt, so adding or renaming a skill must invalidate every artifact's
   * cached proposal, not just that skill's own.
   */
  knownSkills: string[];
}

/** JSON-encoded so a name containing the separator cannot forge a boundary. */
function listPart(values: string[]): string {
  return JSON.stringify([...values].sort());
}

export function fillCacheKey(parts: FillCacheKeyParts): string {
  return sha256(
    [
      parts.provider,
      parts.model,
      `fill-v${FILL_PROMPT_VERSION}`,
      `t${parts.temperature}`,
      `n${parts.maxCriteria}`,
      parts.artifactType,
      parts.path,
      sha256(parts.body),
      listPart(parts.existingNames),
      listPart(parts.knownSkills),
    ].join("|"),
  );
}

export class FillCache {
  /** Write failures warn once per run, not once per artifact. */
  private warned = false;

  constructor(
    private readonly dir: string,
    private readonly enabled: boolean = true,
  ) {}

  get(key: string): Record<string, unknown> | undefined {
    if (!this.enabled) return undefined;
    const path = join(this.dir, `${key}.json`);
    if (!existsSync(path)) return undefined;
    try {
      const proposal: unknown = JSON.parse(readFileSync(path, "utf8"));
      // An entry written by an older schema is a miss, not an error.
      if (!isValidProposal(proposal)) return undefined;
      return proposal as Record<string, unknown>;
    } catch {
      return undefined; // corrupt entry — treat as a miss
    }
  }

  set(key: string, proposal: Record<string, unknown>): void {
    if (!this.enabled) return;
    // The cache is an optimization: a write failure must never abort a run
    // whose proposal already succeeded.
    try {
      mkdirSync(this.dir, { recursive: true });
      writeFileSync(
        join(this.dir, `${key}.json`),
        JSON.stringify(proposal, null, 2),
      );
    } catch (err) {
      if (!this.warned) {
        this.warned = true;
        console.warn(
          `agentevals: could not write the fill cache at ${this.dir} (${
            err instanceof Error ? err.message : String(err)
          }). Continuing without caching.`,
        );
      }
    }
  }
}
