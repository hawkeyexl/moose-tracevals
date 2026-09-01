/**
 * tool-order: assert one tool was used before another.
 *
 * `tool-usage` answers "did it happen, and how often". A large share of what
 * an instruction artifact actually asks for is about *sequence*: read before
 * you write, run the tests after you edit, look at the config before changing
 * it. None of that was expressible — an adherence suite could say Read and
 * Write both happened and still miss a session that wrote first and read
 * afterwards to see what it had done.
 *
 * Adopted from `claude plugin eval`'s `tool_order`, including its
 * `{tool, input_match}` shape: "Read something, then Write to src/" is a
 * different claim from "Read anything, then Write anything", and only the
 * first catches the case where the session read an unrelated file.
 *
 * Semantics are deliberately the weakest useful ones: **some** occurrence of
 * `before` precedes **some** occurrence of `after`. Requiring every `after` to
 * be preceded by an `before` would fail an otherwise adherent session that
 * did the right thing once and then repeated the second half.
 */
import type { ToolCall } from "../trace/types.js";
import type { TraceGrader } from "./types.js";
import {
  fail,
  firstError,
  optionalBoolean,
  optionalString,
  optionsError,
  pass,
  requiredString,
  type Options,
} from "./util.js";

function validateOptions(options: Options): string | undefined {
  return firstError(
    requiredString(options, "before"),
    requiredString(options, "after"),
    optionalString(options, "beforeInputMatch"),
    optionalString(options, "afterInputMatch"),
    optionalBoolean(options, "includeSidechains"),
    // A pattern that will not compile is the eval's bug, not the session's.
    ...(["beforeInputMatch", "afterInputMatch"] as const).map((key) => {
      const value = options[key];
      if (typeof value !== "string") return undefined;
      try {
        new RegExp(value);
        return undefined;
      } catch (err) {
        return `options.${key} is not a valid regular expression (${
          err instanceof Error ? err.message : String(err)
        })`;
      }
    }),
  );
}

/** Index of the first call matching `tool`, or -1. */
function firstIndex(
  calls: ToolCall[],
  tool: string,
  inputMatch: string | undefined,
): number {
  const re = inputMatch === undefined ? undefined : new RegExp(inputMatch);
  return calls.findIndex(
    (c) => c.name === tool && (re === undefined || re.test(JSON.stringify(c.input))),
  );
}

/** Index of the last call matching `tool`, or -1. */
function lastIndex(
  calls: ToolCall[],
  tool: string,
  inputMatch: string | undefined,
): number {
  const re = inputMatch === undefined ? undefined : new RegExp(inputMatch);
  for (let i = calls.length - 1; i >= 0; i--) {
    const c = calls[i];
    if (
      c !== undefined &&
      c.name === tool &&
      (re === undefined || re.test(JSON.stringify(c.input)))
    ) {
      return i;
    }
  }
  return -1;
}

function describe(tool: string, inputMatch: string | undefined): string {
  return inputMatch === undefined ? tool : `${tool} matching /${inputMatch}/`;
}

export const toolOrderGrader: TraceGrader = {
  kind: "tool-order",
  validateOptions,
  grade({ trace, plan }) {
    const options = plan.options ?? {};
    const invalid = validateOptions(options);
    if (invalid !== undefined) return optionsError("tool-order", invalid);

    const before = options.before as string;
    const after = options.after as string;
    const beforeMatch = options.beforeInputMatch as string | undefined;
    const afterMatch = options.afterInputMatch as string | undefined;
    const includeSidechains = options.includeSidechains === true;

    const calls = trace.toolCalls.filter((c) => includeSidechains || !c.sidechain);
    const firstBefore = firstIndex(calls, before, beforeMatch);
    const lastAfter = lastIndex(calls, after, afterMatch);

    // Neither happened: the ordering claim has nothing to bite on. That is a
    // pass, not a silent one — a suite that wants the calls to happen at all
    // says so with tool-usage, which is the grader for that question.
    if (firstBefore === -1 && lastAfter === -1) return pass;

    if (lastAfter === -1) {
      return fail(
        plan,
        `${describe(after, afterMatch)} was never used, so it could not follow ${describe(before, beforeMatch)}`,
      );
    }
    if (firstBefore === -1) {
      return fail(
        plan,
        `${describe(after, afterMatch)} was used without ${describe(before, beforeMatch)} ever being used first`,
      );
    }
    if (firstBefore > lastAfter) {
      return fail(
        plan,
        `${describe(before, beforeMatch)} was only used after ${describe(after, afterMatch)}`,
      );
    }
    return pass;
  },
};
