/** skill-invoked: assert a skill was invoked (or not) during the session. */
import type { TraceGrader } from "./types.js";
import {
  fail,
  firstError,
  optionalEnum,
  optionsError,
  pass,
  requiredString,
  skippedWindow,
  windowFor,
  type Options,
} from "./util.js";

function validateOptions(options: Options): string | undefined {
  return firstError(
    requiredString(options, "skill"),
    optionalEnum(options, "expect", ["used", "not-used"]),
  );
}

export const skillInvokedGrader: TraceGrader = {
  kind: "skill-invoked",
  validateOptions,
  grade({ trace, plan }) {
    const options = plan.options ?? {};
    const invalid = validateOptions(options);
    if (invalid !== undefined) return optionsError("skill-invoked", invalid);
    const skill = options.skill as string;
    const expect = (options.expect as string | undefined) ?? "used";
    const window = windowFor(trace, plan);
    if (window.empty) return skippedWindow(window);
    const used = window.skillInvocations.some((s) => s.name === skill);

    if (expect === "used" && !used) {
      return fail(plan, `skill ${skill} was never invoked`);
    }
    if (expect === "not-used" && used) {
      return fail(plan, `skill ${skill} was invoked but must not be`);
    }
    return pass;
  },
};
