/** regex: assert a pattern does/doesn't appear in session text. */
import type { TraceGrader } from "./types.js";
import {
  fail,
  firstError,
  optionalEnum,
  optionsError,
  pass,
  requiredString,
  type Options,
} from "./util.js";

/** Flags are checked against an empty pattern so the message names the culprit. */
function checkFlags(options: Options): string | undefined {
  const flags = options.flags;
  if (flags === undefined) return undefined;
  if (typeof flags !== "string") return "options.flags must be a string";
  try {
    new RegExp("", flags);
  } catch (err) {
    return `options.flags is invalid: ${(err as Error).message}`;
  }
  return undefined;
}

function checkPattern(options: Options): string | undefined {
  const required = requiredString(options, "pattern");
  if (required !== undefined) return required;
  try {
    new RegExp(options.pattern as string);
  } catch (err) {
    return `options.pattern is not a valid regular expression: ${(err as Error).message}`;
  }
  return undefined;
}

function validateOptions(options: Options): string | undefined {
  return firstError(
    checkPattern(options),
    checkFlags(options),
    optionalEnum(options, "on", ["assistant", "user", "all"]),
    optionalEnum(options, "expect", ["match", "no-match"]),
  );
}

export const regexGrader: TraceGrader = {
  kind: "regex",
  validateOptions,
  grade({ trace, plan }) {
    const options = plan.options ?? {};
    const invalid = validateOptions(options);
    if (invalid !== undefined) return optionsError("regex", invalid);
    const pattern = options.pattern as string;
    const re = new RegExp(pattern, (options.flags as string | undefined) ?? "");
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
