/** turn-count: assert the session stayed within turn bounds. */
import type { TraceGrader } from "./types.js";
import {
  fail,
  firstError,
  optionalNumber,
  optionsError,
  orderedBounds,
  pass,
  requireOneOf,
  type Options,
} from "./util.js";

function validateOptions(options: Options): string | undefined {
  return firstError(
    requireOneOf(options, ["min", "max"]),
    optionalNumber(options, "min", { min: 0, integer: true }),
    optionalNumber(options, "max", { min: 0, integer: true }),
    orderedBounds(options, "min", "max"),
  );
}

export const turnCountGrader: TraceGrader = {
  kind: "turn-count",
  validateOptions,
  grade({ trace, plan }) {
    const options = plan.options ?? {};
    const invalid = validateOptions(options);
    if (invalid !== undefined) return optionsError("turn-count", invalid);
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
