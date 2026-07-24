/** file-access: assert a file was read/written/edited (or not) in the session. */
import type { TraceGrader } from "./types.js";
import { fail, optionsError, pass } from "./util.js";

/** Suffix match with normalized separators, so specs stay platform-neutral. */
function matches(accessPath: string, spec: string): boolean {
  const normalize = (p: string) => p.replace(/\\/g, "/").toLowerCase();
  return normalize(accessPath).endsWith(normalize(spec));
}

export const fileAccessGrader: TraceGrader = {
  kind: "file-access",
  grade({ trace, plan }) {
    const options = plan.options ?? {};
    const path = options.path;
    if (typeof path !== "string" || path.length === 0) {
      return optionsError("file-access", "options.path is required");
    }
    const op = options.op as string | undefined;
    const expect = (options.expect as string | undefined) ?? "accessed";

    const accessed = trace.fileAccesses.some(
      (a) => matches(a.path, path) && (op === undefined || a.op === op),
    );

    const opLabel = op ?? "any";
    if (expect === "accessed" && !accessed) {
      return fail(plan, `file ${path} was never accessed (op: ${opLabel})`);
    }
    if (expect === "not-accessed" && accessed) {
      return fail(plan, `file ${path} was accessed (op: ${opLabel}) but must not be`);
    }
    return pass;
  },
};
