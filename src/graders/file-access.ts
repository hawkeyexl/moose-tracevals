/** file-access: assert a file was read/written/edited (or not) in the session. */
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

/** Mirrors FileAccess["op"] in the normalized trace model. */
const OPS = ["read", "write", "edit"] as const;

function validateOptions(options: Options): string | undefined {
  return firstError(
    requiredString(options, "path"),
    optionalEnum(options, "op", OPS),
    optionalEnum(options, "expect", ["accessed", "not-accessed"]),
  );
}

/** Suffix match with normalized separators, so specs stay platform-neutral. */
function matches(accessPath: string, spec: string): boolean {
  const normalize = (p: string) => p.replace(/\\/g, "/").toLowerCase();
  return normalize(accessPath).endsWith(normalize(spec));
}

export const fileAccessGrader: TraceGrader = {
  kind: "file-access",
  validateOptions,
  grade({ trace, plan }) {
    const options = plan.options ?? {};
    const invalid = validateOptions(options);
    if (invalid !== undefined) return optionsError("file-access", invalid);
    const path = options.path as string;
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
