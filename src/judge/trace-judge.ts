/**
 * The trace-adherence ensemble judge: N independent runs per eval plan, each a
 * fresh request with no shared context, aggregated by consensus and routed
 * through confidence zones.
 *
 * The ensemble mechanics (retry-once, errored runs counting against consensus,
 * cache replay) now live in the inference library; what stays here is what is
 * agentevals-specific — the per-plan budget gate, the trace-worded verdict
 * schema, and the `JudgedEval` shape the reporters consume.
 */
import {
  JsonCache,
  computeConsensus,
  costOfRuns,
  pricingFor,
  runEnsemble,
  zoneFor,
  type ConsensusResult,
  type InferenceProvider,
  type JudgeRun,
  type Pricing,
} from "@hawkeyexl/inference";
import verdictSchemaJson from "./verdict-schema.json" with { type: "json" };
import type { EvalPlan } from "../core/plan.js";
import { cacheKey } from "./cache.js";
import { buildUserContent, JUDGE_SYSTEM_PROMPT } from "./prompt.js";

/**
 * agentevals' own verdict wording. Structurally identical to the library's
 * canonical schema, but the field descriptions talk about sessions and tool
 * calls rather than pages — and those descriptions are prompt surface that
 * steers the model, so they are worth keeping (inference ADR 01001).
 */
const verdictSchema = verdictSchemaJson as Record<string, unknown>;

export interface TraceJudgeOptions {
  provider: InferenceProvider;
  /** Ensemble size; default 3. */
  runs?: number;
  /** Default 0; nonzero adds verdict noise. */
  temperature?: number;
  zones?: { autoPass: number; autoFail: number };
  cacheDir?: string;
  noCache?: boolean;
  maxCostUsd?: number;
  /**
   * Price override for this model, from the selected provider's config
   * section. Without it a model the library's table does not know costs 0,
   * which silently disables `maxCostUsd`.
   */
  pricing?: Pricing;
}

export interface JudgedEval {
  evalName: string;
  artifact: string;
  artifactName: string;
  grader: string;
  implicit: boolean;
  outcome: "pass" | "fail" | "needs-review" | "skipped";
  consensus?: ConsensusResult;
  skipReason?: string;
  costUsd: number;
  durationMs: number;
}

export type TraceJudge = (
  plans: EvalPlan[],
  renderedTrace: string,
) => Promise<JudgedEval[]>;

export function makeTraceJudge(options: TraceJudgeOptions): TraceJudge {
  const provider = options.provider;
  const runsPerEval = options.runs ?? 3;
  const temperature = options.temperature ?? 0;
  const zones = options.zones ?? { autoPass: 0.8, autoFail: 0.8 };
  const cache = new JsonCache<JudgeRun[]>(
    options.cacheDir ?? ".agentevals/cache",
    options.noCache !== true && options.cacheDir !== undefined,
    "agentevals",
  );
  const pricing = pricingFor(provider.modelName(), options.pricing);

  return async (plans, renderedTrace) => {
    let spentUsd = 0;
    const results: JudgedEval[] = [];

    for (const plan of plans) {
      const start = Date.now();
      const base = {
        evalName: plan.evalName,
        artifact: plan.artifact.path,
        artifactName: plan.artifact.name,
        grader: plan.grader,
        implicit: plan.implicit,
      };

      if (options.maxCostUsd !== undefined && spentUsd >= options.maxCostUsd) {
        results.push({
          ...base,
          outcome: "skipped",
          skipReason: `judge cost budget exhausted ($${options.maxCostUsd})`,
          costUsd: 0,
          durationMs: 0,
        });
        continue;
      }

      const runs = await runEnsemble({
        provider,
        system: JUDGE_SYSTEM_PROMPT,
        user: buildUserContent(plan, renderedTrace),
        runs: runsPerEval,
        temperature,
        schema: verdictSchema,
        cache,
        cacheKey: cacheKey(
          provider.provider(),
          provider.modelName(),
          runsPerEval,
          temperature,
          renderedTrace,
          plan,
        ),
        label: "agentevals",
      });

      const consensusBase = computeConsensus(runs);
      const zone = zoneFor(consensusBase, zones);
      const consensus: ConsensusResult = { ...consensusBase, zone };
      const costUsd = costOfRuns(runs, pricing);
      spentUsd += costUsd;

      results.push({
        ...base,
        outcome:
          zone === "auto-pass"
            ? "pass"
            : zone === "auto-fail"
              ? "fail"
              : "needs-review",
        consensus,
        costUsd,
        durationMs: Date.now() - start,
      });
    }
    return results;
  };
}
