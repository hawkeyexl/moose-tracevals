/** cost: assert the session stayed within cost/token budgets. */
import type { TraceGrader } from "./types.js";
import { fail, pass } from "./util.js";

export const costGrader: TraceGrader = {
  kind: "cost",
  grade({ trace, plan }) {
    const options = plan.options ?? {};
    const usage = trace.usage;
    // Each configured budget is evaluated independently: a missing-data skip on
    // one must not suppress the other. Only skip the whole eval when no
    // configured budget could be checked at all.
    const skips: string[] = [];
    let checked = false;

    if (typeof options.maxUsd === "number") {
      if (usage?.totalCostUsd === undefined) {
        skips.push("no cost data (maxUsd not checkable)");
      } else {
        checked = true;
        if (usage.totalCostUsd > options.maxUsd) {
          return fail(
            plan,
            `session cost $${usage.totalCostUsd.toFixed(4)}; at most $${options.maxUsd} allowed`,
          );
        }
      }
    }

    if (typeof options.maxTokens === "number") {
      if (usage === undefined) {
        skips.push("no usage data (maxTokens not checkable)");
      } else {
        checked = true;
        const total = usage.inputTokens + usage.outputTokens;
        if (total > options.maxTokens) {
          return fail(
            plan,
            `session used ${total} tokens; at most ${options.maxTokens} allowed`,
          );
        }
      }
    }

    if (!checked && skips.length > 0) {
      return {
        findings: [],
        skipped: `trace carries insufficient cost data: ${skips.join("; ")}`,
      };
    }
    return pass;
  },
};
