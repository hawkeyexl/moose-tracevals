/** json-output: validate the session's final assistant text as JSON. */
import { Ajv2020 } from "ajv/dist/2020.js";
import type { TraceGrader } from "./types.js";
import { fail, finding, optionsError, pass } from "./util.js";

const ajv = new Ajv2020({ allErrors: true, strict: false });

export const jsonOutputGrader: TraceGrader = {
  kind: "json-output",
  grade({ trace, plan }) {
    const options = plan.options ?? {};
    const schema = options.schema;
    if (schema === undefined || typeof schema !== "object") {
      return optionsError("json-output", "options.schema is required");
    }

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
