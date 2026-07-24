/** tool-usage: assert a tool was used / not used / used within count bounds. */
import type { TraceGrader } from "./types.js";
import { fail, optionsError, pass } from "./util.js";

export const toolUsageGrader: TraceGrader = {
  kind: "tool-usage",
  grade({ trace, plan }) {
    const options = plan.options ?? {};
    const tool = options.tool;
    if (typeof tool !== "string" || tool.length === 0) {
      return optionsError("tool-usage", `options.tool is required`);
    }
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
