/**
 * The trace-adherence ensemble judge: N independent runs per eval plan, each a
 * fresh request with no shared context, aggregated by consensus and routed
 * through confidence zones.
 *
 * The ensemble mechanics (retry-once, errored runs counting against consensus,
 * cache replay) now live in the inference library; what stays here is what is
 * moose-tracevals-specific — the per-plan budget gate, the trace-worded verdict
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
 * moose-tracevals' own verdict wording. Structurally identical to the library's
 * canonical schema, but the field descriptions talk about sessions and tool
 * calls rather than pages — and those descriptions are prompt surface that
 * steers the model, so they are worth keeping (inference ADR 01001).
 */
const verdictSchema = verdictSchemaJson as Record<string, unknown>;

export interface TraceJudgeOptions {
  provider: InferenceProvider;
  /**
   * Construct the provider an eval names with `provider:`, plus its pricing.
   * Without this hook such an eval errors rather than being judged silently by
   * the default model — an eval that names a provider is asking for that one.
   */
  providerFor?: (name: string) => { provider: InferenceProvider; pricing?: Pricing };
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
  outcome: "pass" | "fail" | "needs-review" | "skipped" | "error";
  consensus?: ConsensusResult;
  skipReason?: string;
  /** Set when the eval could not be judged at all. */
  error?: string;
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
    options.cacheDir ?? ".moose-tracevals/cache",
    options.noCache !== true && options.cacheDir !== undefined,
    "moose-tracevals",
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

      // An eval may name its own provider. Resolve it before the budget gate
      // so a typo is reported as the eval's own error rather than hidden
      // behind an exhausted budget.
      //
      // The comparison is on the provider *name*, which is the unit the
      // schema's `provider` field names — not on instance identity. A match
      // therefore reuses the run's already-constructed default, inheriting any
      // `--model` override, which is what an eval naming only a provider
      // should get. Two spellings of one provider would each construct their
      // own instance, but the accepted set is closed (anthropic, openai,
      // claude-cli, mock) and has no aliases, so that cannot arise today;
      // adding an alias would be the change that makes it matter.
      let evalProvider = provider;
      let evalPricing = pricing;
      if (plan.provider !== undefined && plan.provider !== provider.provider()) {
        const resolved = resolveOverride(plan.provider, options);
        if ("error" in resolved) {
          results.push({
            ...base,
            outcome: "error",
            error: resolved.error,
            costUsd: 0,
            durationMs: Date.now() - start,
          });
          continue;
        }
        evalProvider = resolved.provider;
        // Through pricingFor, exactly as the default provider's pricing is
        // resolved above: the config override is a fallback for models the
        // library's table does not know, not a replacement for it. Assigning
        // the raw override would leave an unpriced override provider at
        // pricing `undefined`, and costOfRuns returns 0 for that — silently
        // exempting the eval from maxCostUsd.
        evalPricing = pricingFor(evalProvider.modelName(), resolved.pricing);
      }

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
        provider: evalProvider,
        system: JUDGE_SYSTEM_PROMPT,
        user: buildUserContent(plan, renderedTrace),
        runs: runsPerEval,
        temperature,
        schema: verdictSchema,
        cache,
        cacheKey: cacheKey(
          evalProvider.provider(),
          evalProvider.modelName(),
          runsPerEval,
          temperature,
          renderedTrace,
          plan,
        ),
        label: "moose-tracevals",
      });

      const consensusBase = computeConsensus(runs);
      const zone = zoneFor(consensusBase, zones);
      const consensus: ConsensusResult = { ...consensusBase, zone };
      const costUsd = costOfRuns(runs, evalPricing);
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

/**
 * Build the provider an eval named, or say why it could not be built. Kept
 * out of the loop so the failure is one shape: never a throw that costs the
 * report every other verdict, never a silent fall back to the default model.
 */
function resolveOverride(
  name: string,
  options: TraceJudgeOptions,
): { provider: InferenceProvider; pricing?: Pricing } | { error: string } {
  if (options.providerFor === undefined) {
    return {
      error: `eval names provider "${name}", but this run cannot construct providers by name`,
    };
  }
  try {
    return options.providerFor(name);
  } catch (err) {
    return {
      error: `could not construct provider "${name}" for this eval: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
