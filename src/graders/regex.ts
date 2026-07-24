/** regex: assert a pattern does/doesn't appear in session text. */
import type { TraceGrader } from "./types.js";
import { fail, optionsError, pass } from "./util.js";

export const regexGrader: TraceGrader = {
  kind: "regex",
  grade({ trace, plan }) {
    const options = plan.options ?? {};
    const pattern = options.pattern;
    if (typeof pattern !== "string" || pattern.length === 0) {
      return optionsError("regex", "options.pattern is required");
    }
    let re: RegExp;
    try {
      re = new RegExp(pattern, (options.flags as string | undefined) ?? "");
    } catch (err) {
      return optionsError("regex", `invalid pattern: ${(err as Error).message}`);
    }
    const on = (options.on as string | undefined) ?? "assistant";
    const expect = (options.expect as string | undefined) ?? "match";

    const corpus =
      on === "user"
        ? trace.userMessages
        : on === "all"
          ? [...trace.userMessages, ...trace.assistantTexts]
          : trace.assistantTexts;
    const matched = corpus.some((text) => re.test(text));

    if (expect === "match" && !matched) {
      return fail(plan, `pattern /${pattern}/ never matched ${on} text`);
    }
    if (expect === "no-match" && matched) {
      return fail(plan, `pattern /${pattern}/ matched ${on} text but must not`);
    }
    return pass;
  },
};
