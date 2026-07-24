/** turn-count: assert the session stayed within turn bounds. */
import type { TraceGrader } from "./types.js";
import { fail, pass } from "./util.js";

export const turnCountGrader: TraceGrader = {
  kind: "turn-count",
  grade({ trace, plan }) {
    const options = plan.options ?? {};
    const { turnCount } = trace;
    if (typeof options.max === "number" && turnCount > options.max) {
      return fail(plan, `${turnCount} turn(s); at most ${options.max} allowed`);
    }
    if (typeof options.min === "number" && turnCount < options.min) {
      return fail(plan, `${turnCount} turn(s); at least ${options.min} required`);
    }
    return pass;
  },
};
