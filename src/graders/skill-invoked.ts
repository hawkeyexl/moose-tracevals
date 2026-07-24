/** skill-invoked: assert a skill was invoked (or not) during the session. */
import type { TraceGrader } from "./types.js";
import { fail, optionsError, pass } from "./util.js";

export const skillInvokedGrader: TraceGrader = {
  kind: "skill-invoked",
  grade({ trace, plan }) {
    const options = plan.options ?? {};
    const skill = options.skill;
    if (typeof skill !== "string" || skill.length === 0) {
      return optionsError("skill-invoked", "options.skill is required");
    }
    const expect = (options.expect as string | undefined) ?? "used";
    const used = trace.skillInvocations.some((s) => s.name === skill);

    if (expect === "used" && !used) {
      return fail(plan, `skill ${skill} was never invoked`);
    }
    if (expect === "not-used" && used) {
      return fail(plan, `skill ${skill} was invoked but must not be`);
    }
    return pass;
  },
};
