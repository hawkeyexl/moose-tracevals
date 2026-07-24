/**
 * The trace-adherence ensemble judge: N independent runs per eval plan, each a
 * fresh request with no shared context, aggregated by docevals' consensus and
 * confidence zones. Mirrors docevals' singleRun semantics — one retry on an
 * invalid verdict, then the run records as an error that counts against
 * consensus (ADR 01001).
 */
import { Ajv2020 } from "ajv/dist/2020.js";
import verdictSchemaJson from "./verdict-schema.json" with { type: "json" };
import {
  computeConsensus,
  zoneFor,
  type ConsensusResult,
  type JudgeProvider,
  type JudgeRun,
  type JudgeVerdict,
} from "docevals";
import type { EvalPlan } from "../core/plan.js";
import { cacheKey, JudgeCache } from "./cache.js";
import { costOfUsage, pricingFor } from "./cost.js";
import { buildUserContent, JUDGE_SYSTEM_PROMPT } from "./prompt.js";

const verdictSchema = verdictSchemaJson as Record<string, unknown>;

const ajv = new Ajv2020({ allErrors: true });
const validateVerdict = ajv.compile(verdictSchema);

/** USD per million tokens; unknown models cost 0 (unknown), never a guess. */
function costOfRuns(runs: JudgeRun[], model: string): number {
  const pricing = pricingFor(model);
  let usd = 0;
  for (const run of runs) {
    if (run.cached) continue;
    usd += costOfUsage(run.usage, pricing);
  }
  return usd;
}

async function singleRun(
  provider: JudgeProvider,
  system: string,
  user: string,
  temperature: number,
): Promise<JudgeRun> {
  const start = Date.now();
  const base = {
    provider: provider.provider(),
    model: provider.modelName(),
    cached: false,
  };
  let lastError = "unknown error";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await provider.completeJSON({
        system,
        user,
        schema: verdictSchema,
        temperature,
      });
      if (validateVerdict(response.json)) {
        return {
          ...base,
          verdict: response.json as unknown as JudgeVerdict,
          usage: response.usage,
          durationMs: Date.now() - start,
        };
      }
      lastError = `Verdict failed schema validation: ${(validateVerdict.errors ?? [])
        .map((e) => `${e.instancePath} ${e.message}`)
        .join("; ")}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return { ...base, error: lastError, durationMs: Date.now() - start };
}

export interface TraceJudgeOptions {
  provider: JudgeProvider;
  /** Ensemble size; default 3. */
  runs?: number;
  /** Default 0; nonzero adds verdict noise. */
  temperature?: number;
  zones?: { autoPass: number; autoFail: number };
  cacheDir?: string;
  noCache?: boolean;
  maxCostUsd?: number;
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
  const cache = new JudgeCache(
    options.cacheDir ?? ".agentevals/cache",
    options.noCache !== true && options.cacheDir !== undefined,
  );
  if (temperature > 0) {
    console.warn(
      `agentevals: judge temperature is ${temperature} — nonzero temperature adds noise to verdicts; 0 is strongly recommended.`,
    );
  }

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

      const key = cacheKey(
        provider.provider(),
        provider.modelName(),
        runsPerEval,
        temperature,
        renderedTrace,
        plan,
      );
      let runs = cache.get(key);
      if (!runs) {
        const user = buildUserContent(plan, renderedTrace);
        runs = [];
        for (let i = 0; i < runsPerEval; i++) {
          runs.push(
            await singleRun(provider, JUDGE_SYSTEM_PROMPT, user, temperature),
          );
        }
        cache.set(key, runs);
      }

      const consensusBase = computeConsensus(runs);
      const zone = zoneFor(consensusBase, zones);
      const consensus: ConsensusResult = { ...consensusBase, zone };
      const costUsd = costOfRuns(runs, provider.modelName());
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
