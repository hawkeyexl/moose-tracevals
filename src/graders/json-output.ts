/** json-output: validate the session's final assistant text as JSON. */
import { Ajv2020 } from "ajv/dist/2020.js";
import type { TraceGrader } from "./types.js";
import { fail, finding, optionsError, pass } from "./util.js";

const ajv = new Ajv2020({ allErrors: true, strict: false });

/**
 * Shape-only. Compiling here as well would risk an Ajv duplicate-$id throw on
 * the second compile, so `grade()` remains the one place the schema is built.
 */
function validateOptions(options: Record<string, unknown>): string | undefined {
  const schema = options.schema;
  if (
    schema === undefined ||
    schema === null ||
    typeof schema !== "object" ||
    Array.isArray(schema)
  ) {
    return "options.schema is required and must be a JSON Schema object";
  }
  return undefined;
}

export const jsonOutputGrader: TraceGrader = {
  kind: "json-output",
  validateOptions,
  grade({ trace, plan }) {
    const options = plan.options ?? {};
    const invalid = validateOptions(options);
    if (invalid !== undefined) return optionsError("json-output", invalid);
    const schema = options.schema;

    const last = trace.assistantTexts.at(-1);
    if (last === undefined) {
      return fail(plan, "session produced no assistant text to validate");
    }
    let data: unknown;
    try {
      data = JSON.parse(last);
    } catch {
      return fail(plan, "final assistant output is not valid JSON");
    }

    let validate;
    try {
      validate = ajv.compile(schema as Record<string, unknown>);
    } catch (err) {
      return optionsError(
        "json-output",
        `schema failed to compile: ${(err as Error).message}`,
      );
    }
    if (validate(data)) return pass;
    return {
      findings: (validate.errors ?? []).map((e) =>
        finding(plan, `${e.instancePath || "/"} ${e.message ?? "invalid"}`),
      ),
    };
  },
};
