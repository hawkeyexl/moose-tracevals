/**
 * Judge response cache: content-addressed JSON files storing the full
 * ensemble, so cached evals replay identically. The key covers provider,
 * model, prompt version, run count, temperature, the rendered trace, and the
 * plan — any change misses. Adapted from docevals' JudgeCache (ADR 01001).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { JudgeRun } from "docevals";
import type { EvalPlan } from "../core/plan.js";
import { PROMPT_VERSION } from "./prompt.js";

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function cacheKey(
  provider: string,
  model: string,
  runs: number,
  temperature: number,
  renderedTrace: string,
  plan: EvalPlan,
  promptVersion: number = PROMPT_VERSION,
): string {
  const planFingerprint = JSON.stringify({
    assertion: plan.assertion,
    evidence: plan.evidence,
    examples: plan.examples,
    artifact: plan.artifact.content,
  });
  return sha256(
    [
      provider,
      model,
      `v${promptVersion}`,
      `r${runs}`,
      `t${temperature}`,
      sha256(renderedTrace),
      sha256(planFingerprint),
    ].join("|"),
  );
}

export class JudgeCache {
  /** Cache-write failures warn once per run, not once per eval. */
  private warned = false;

  constructor(
    private readonly dir: string,
    private readonly enabled: boolean = true,
  ) {}

  get(key: string): JudgeRun[] | undefined {
    if (!this.enabled) return undefined;
    const path = join(this.dir, `${key}.json`);
    if (!existsSync(path)) return undefined;
    try {
      const runs = JSON.parse(readFileSync(path, "utf8")) as JudgeRun[];
      return runs.map((r) => ({ ...r, cached: true }));
    } catch {
      return undefined; // Corrupt cache entry — treat as a miss.
    }
  }

  set(key: string, runs: JudgeRun[]): void {
    if (!this.enabled) return;
    // The cache is an optimization: a write failure must never abort a run
    // whose judging already succeeded.
    try {
      mkdirSync(this.dir, { recursive: true });
      writeFileSync(join(this.dir, `${key}.json`), JSON.stringify(runs, null, 2));
    } catch (e) {
      if (!this.warned) {
        this.warned = true;
        console.warn(
          `agentevals: could not write the judge cache at ${this.dir} (${e instanceof Error ? e.message : String(e)}). Continuing without caching.`,
        );
      }
    }
  }
}
