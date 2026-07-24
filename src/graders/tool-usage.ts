/** tool-usage: assert a tool was used / not used / used within count bounds. */
import type { TraceGrader } from "./types.js";
import {
  fail,
  firstError,
  optionalBoolean,
  optionalEnum,
  optionalNumber,
  optionsError,
  orderedBounds,
  pass,
  requiredString,
  type Options,
} from "./util.js";

/**
 * A criterion that can never pass is as useless as one that can never fail:
 * `expect: not-used` with `min >= 1` demands the tool be both absent and
 * called, and `expect: used` with `max: 0` is the mirror image.
 */
function checkContradiction(options: Options): string | undefined {
  const expect = (options.expect as string | undefined) ?? "used";
  const { min, max } = options;
  if (expect === "not-used" && typeof min === "number" && min > 0) {
    return "options.min is unsatisfiable with expect: not-used";
  }
  if (expect === "used" && typeof max === "number" && max === 0) {
    return "options.max of 0 is unsatisfiable with expect: used";
  }
  return undefined;
}

function validateOptions(options: Options): string | undefined {
  return firstError(
    requiredString(options, "tool"),
    optionalEnum(options, "expect", ["used", "not-used"]),
    optionalNumber(options, "min", { min: 0, integer: true }),
    optionalNumber(options, "max", { min: 0, integer: true }),
    orderedBounds(options, "min", "max"),
    checkContradiction(options),
    optionalBoolean(options, "includeSidechains"),
  );
}

export const toolUsageGrader: TraceGrader = {
  kind: "tool-usage",
  validateOptions,
  grade({ trace, plan }) {
    const options = plan.options ?? {};
    const invalid = validateOptions(options);
    if (invalid !== undefined) return optionsError("tool-usage", invalid);
    const tool = options.tool as string;
    const expect = (options.expect as string | undefined) ?? "used";
    const includeSidechains = options.includeSidechains === true;

    const count = trace.toolCalls.filter(
      (c) => c.name === tool && (includeSidechains || !c.sidechain),
    ).length;

    if (expect === "not-used" && count > 0) {
      return fail(plan, `tool ${tool} was used ${count} time(s) but must not be`);
    }
    if (expect === "used" && count === 0 && options.min === undefined) {
      return fail(plan, `tool ${tool} was never used`);
    }
    if (typeof options.min === "number" && count < options.min) {
      return fail(
        plan,
        `tool ${tool} was used ${count} time(s); at least ${options.min} required`,
      );
    }
    if (typeof options.max === "number" && count > options.max) {
      return fail(
        plan,
        `tool ${tool} was used ${count} time(s); at most ${options.max} allowed`,
      );
    }
    return pass;
  },
};
