/** cost: assert the session stayed within cost/token budgets. */
import type { TraceGrader } from "./types.js";
import { fail, pass } from "./util.js";

export const costGrader: TraceGrader = {
  kind: "cost",
  grade({ trace, plan }) {
    const options = plan.options ?? {};
    const usage = trace.usage;

    if (typeof options.maxUsd === "number") {
      if (usage?.totalCostUsd === undefined) {
        return {
          findings: [],
          skipped: "trace carries no cost data (maxUsd not checkable)",
        };
      }
      if (usage.totalCostUsd > options.maxUsd) {
        return fail(
          plan,
          `session cost $${usage.totalCostUsd.toFixed(4)}; at most $${options.maxUsd} allowed`,
        );
      }
    }

    if (typeof options.maxTokens === "number") {
      if (usage === undefined) {
        return {
          findings: [],
          skipped: "trace carries no usage data (maxTokens not checkable)",
        };
      }
      const total = usage.inputTokens + usage.outputTokens;
      if (total > options.maxTokens) {
        return fail(
          plan,
          `session used ${total} tokens; at most ${options.maxTokens} allowed`,
        );
      }
    }
    return pass;
  },
};
